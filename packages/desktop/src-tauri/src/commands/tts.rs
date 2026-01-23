use crate::commands::config::get_volcengine_config;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{stream::Stream, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{Emitter, Manager};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::header::HeaderValue;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{connect_async, tungstenite::error::Error as WsError};
use uuid::Uuid;

const TTS_WS_ENDPOINT: &str = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";

const PROTOCOL_VERSION: u8 = 0x1;
const HEADER_SIZE: u8 = 0x1;

const MSG_TYPE_FULL_CLIENT: u8 = 0x1;
const MSG_TYPE_AUDIO_ONLY_RESPONSE: u8 = 0xb;
const MSG_TYPE_ERROR: u8 = 0xf;

const FLAG_WITH_EVENT: u8 = 0x4;
const SERIALIZATION_JSON: u8 = 0x1;
const COMPRESSION_NONE: u8 = 0x0;

const EVENT_START_CONNECTION: i32 = 1;
const EVENT_FINISH_CONNECTION: i32 = 2;
const EVENT_CONNECTION_STARTED: i32 = 50;
const EVENT_CONNECTION_FINISHED: i32 = 52;
const EVENT_START_SESSION: i32 = 100;
const EVENT_FINISH_SESSION: i32 = 102;
const EVENT_SESSION_STARTED: i32 = 150;
const EVENT_SESSION_FINISHED: i32 = 152;
const EVENT_TASK_REQUEST: i32 = 200;
const EVENT_TTS_RESPONSE: i32 = 352;

const TTS_CHUNK_MAX: usize = 60;
const TTS_CHUNK_MIN: usize = 12;
const TTS_STREAM_CHUNK_DELAY_MS: u64 = 80;

#[derive(Clone, Serialize)]
pub struct TtsStreamChunkPayload {
    pub chunk: Vec<u8>,
}

#[derive(Clone, Serialize)]
pub struct TtsStreamFinishedPayload {
    #[serde(rename = "totalBytes")]
    pub total_bytes: usize,
}

#[derive(Clone, Serialize)]
pub struct TtsStreamErrorPayload {
    pub message: String,
}

#[derive(Debug)]
struct ParsedFrame {
    message_type: u8,
    flags: u8,
    serialization: u8,
    event: Option<i32>,
    payload: Vec<u8>,
}

/// TTS 请求
#[derive(Debug, Serialize)]
struct TtsRequest {
    app: TtsAppConfig,
    user: TtsUserConfig,
    audio: TtsAudioConfig,
    request: TtsRequestConfig,
}

#[derive(Debug, Serialize)]
struct TtsAppConfig {
    appid: String,
    token: String,
    cluster: String,
}

#[derive(Debug, Serialize)]
struct TtsUserConfig {
    uid: String,
}

#[derive(Debug, Serialize)]
struct TtsAudioConfig {
    voice_type: String,
    encoding: String,
    speed_ratio: f32,
    volume_ratio: f32,
    pitch_ratio: f32,
}

#[derive(Debug, Serialize)]
struct TtsRequestConfig {
    reqid: String,
    text: String,
    operation: String,
}

/// TTS 响应
#[derive(Debug, Deserialize)]
struct TtsResponse {
    #[serde(default)]
    code: i32,
    #[serde(default)]
    message: String,
    #[serde(default)]
    data: Option<String>, // Base64 编码的音频数据
}

fn build_full_client_frame(event: i32, session_id: Option<&str>, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::new();
    frame.push((PROTOCOL_VERSION << 4) | HEADER_SIZE);
    frame.push((MSG_TYPE_FULL_CLIENT << 4) | FLAG_WITH_EVENT);
    frame.push((SERIALIZATION_JSON << 4) | COMPRESSION_NONE);
    frame.push(0x00);
    frame.extend_from_slice(&event.to_be_bytes());

    if let Some(session_id) = session_id {
        let id_bytes = session_id.as_bytes();
        frame.extend_from_slice(&(id_bytes.len() as u32).to_be_bytes());
        frame.extend_from_slice(id_bytes);
    }

    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}

fn parse_frame(data: &[u8]) -> Result<ParsedFrame, String> {
    if data.len() < 4 {
        return Err("Frame too short".to_string());
    }

    let header_size = (data[0] & 0x0f) as usize * 4;
    if header_size > data.len() {
        return Err("Invalid header size".to_string());
    }

    let message_type = data[1] >> 4;
    let flags = data[1] & 0x0f;
    let serialization = data[2] >> 4;

    let mut offset = header_size;
    let mut event = None;

    if (flags & FLAG_WITH_EVENT) != 0 {
        if offset + 4 > data.len() {
            return Err("Missing event field".to_string());
        }
        event = Some(i32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]));
        offset += 4;
    }

    if message_type == MSG_TYPE_ERROR {
        if offset + 4 > data.len() {
            return Err("Missing error code".to_string());
        }
        let payload = data[offset + 4..].to_vec();
        return Ok(ParsedFrame {
            message_type,
            flags,
            serialization,
            event,
            payload,
        });
    }

    if offset + 4 <= data.len() {
        let id_len = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;
        if id_len > 0 {
            if offset + id_len > data.len() {
                return Err("Invalid id length".to_string());
            }
            offset += id_len;
        }
    }

    let mut payload = Vec::new();
    if offset + 4 <= data.len() {
        let payload_len = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;
        if offset + payload_len <= data.len() {
            payload = data[offset..offset + payload_len].to_vec();
        } else if offset < data.len() {
            payload = data[offset..].to_vec();
        }
    }

    Ok(ParsedFrame {
        message_type,
        flags,
        serialization,
        event,
        payload,
    })
}

fn is_boundary_char(ch: char) -> bool {
    matches!(
        ch,
        '。' | '！' | '？' | '；' | '，' | '、' | '.' | '!' | '?' | ';' | ',' | '\n'
    )
}

fn split_tts_text(text: &str) -> Vec<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }

    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_len = 0usize;

    for ch in trimmed.chars() {
        current.push(ch);
        current_len += 1;

        let should_split = current_len >= TTS_CHUNK_MAX
            || (is_boundary_char(ch) && current_len >= TTS_CHUNK_MIN);

        if should_split {
            let chunk = current.trim();
            if !chunk.is_empty() {
                chunks.push(chunk.to_string());
            }
            current.clear();
            current_len = 0;
        }
    }

    let rest = current.trim();
    if !rest.is_empty() {
        chunks.push(rest.to_string());
    }

    if chunks.is_empty() {
        chunks.push(trimmed.to_string());
    }

    chunks
}

async fn wait_for_event<S>(
    ws_read: &mut S,
    target_event: i32,
) -> Result<(), String>
where
    S: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    while let Some(message) = ws_read.next().await {
        let message = message.map_err(|e| format!("接收消息失败: {}", e))?;
        match message {
            Message::Binary(data) => {
                let frame = parse_frame(&data)?;
                if frame.message_type == MSG_TYPE_ERROR {
                    let payload_text = String::from_utf8_lossy(&frame.payload);
                    return Err(format!("TTS 服务错误: {}", payload_text));
                }
                if let Some(event) = frame.event {
                    if event == target_event {
                        return Ok(());
                    }
                }
            }
            Message::Text(text) => {
                return Err(format!("TTS 返回文本消息: {}", text));
            }
            Message::Close(_) => {
                return Err("TTS 连接已关闭".to_string());
            }
            _ => {}
        }
    }

    Err("TTS 连接已结束".to_string())
}

/// 语音合成 - 使用 HTTP API
#[tauri::command]
pub async fn tts_speak(text: String, voice_type: Option<String>) -> Result<Vec<u8>, String> {
    // 获取配置
    let volcengine_config = get_volcengine_config().await?;

    if volcengine_config.app_id.is_empty() || volcengine_config.access_token.is_empty() {
        return Err("请先在设置中配置火山引擎 API".to_string());
    }

    let voice = voice_type.unwrap_or_else(|| volcengine_config.tts.voice_type.clone());

    // 构建请求
    let request = TtsRequest {
        app: TtsAppConfig {
            appid: volcengine_config.app_id.clone(),
            token: volcengine_config.access_token.clone(),
            cluster: volcengine_config.tts.cluster.clone(),
        },
        user: TtsUserConfig {
            uid: "reason-desktop".to_string(),
        },
        audio: TtsAudioConfig {
            voice_type: voice,
            encoding: "mp3".to_string(),
            speed_ratio: 1.0,
            volume_ratio: 1.0,
            pitch_ratio: 1.0,
        },
        request: TtsRequestConfig {
            reqid: Uuid::new_v4().to_string(),
            text,
            operation: "query".to_string(),
        },
    };

    // 发送 HTTP 请求
    let client = reqwest::Client::new();
    let response = client
        .post("https://openspeech.bytedance.com/api/v1/tts")
        .header(
            "Authorization",
            format!("Bearer;{}", volcengine_config.access_token),
        )
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP 错误: {}", response.status()));
    }

    let tts_response: TtsResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if tts_response.code != 0 && tts_response.code != 3000 {
        return Err(format!(
            "TTS 失败 (code {}): {}",
            tts_response.code, tts_response.message
        ));
    }

    let audio_base64 = tts_response.data.ok_or("无音频数据返回")?;

    // 解码 Base64
    let audio_bytes = STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("解码音频失败: {}", e))?;

    Ok(audio_bytes)
}

/// 语音合成 - WebSocket 流式返回
#[tauri::command]
pub async fn tts_speak_stream(
    app: tauri::AppHandle,
    text: String,
    voice_type: Option<String>,
) -> Result<(), String> {
    let volcengine_config = get_volcengine_config().await?;

    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;

    println!(
        "[TTS-WS] start text_len={} voice_override={}",
        text.chars().count(),
        voice_type.is_some()
    );

    let has_app_id = !volcengine_config.app_id.is_empty();
    let has_access_token = !volcengine_config.access_token.is_empty();
    println!(
        "[TTS-WS] app_id={} access_token={}",
        if has_app_id { "set" } else { "missing" },
        if has_access_token { "set" } else { "missing" }
    );

    if !has_app_id || !has_access_token {
        let message = "请先在设置中配置火山引擎 API".to_string();
        let _ = window.emit(
            "tts-stream-error",
            TtsStreamErrorPayload {
                message: message.clone(),
            },
        );
        return Err(message);
    }

    let resource_id = if !volcengine_config.tts.resource_id.is_empty() {
        volcengine_config.tts.resource_id.clone()
    } else {
        volcengine_config
            .legacy_resource_id
            .clone()
            .unwrap_or_default()
    };
    if resource_id.is_empty() {
        let message = "请先在设置中配置火山引擎语音合成资源 ID".to_string();
        let _ = window.emit(
            "tts-stream-error",
            TtsStreamErrorPayload {
                message: message.clone(),
            },
        );
        return Err(message);
    }

    let voice = voice_type.unwrap_or_else(|| volcengine_config.tts.voice_type.clone());
    let connect_id = Uuid::new_v4().to_string();
    let session_id = Uuid::new_v4().to_string();

    println!("[TTS-WS] resource_id={} voice_type={}", resource_id, voice);

    let mut ws_request = TTS_WS_ENDPOINT
        .into_client_request()
        .map_err(|e| format!("Failed to build WS request: {}", e))?;
    ws_request.headers_mut().insert(
        "X-Api-App-Key",
        HeaderValue::from_str(&volcengine_config.app_id)
            .map_err(|e| format!("Invalid X-Api-App-Key header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Access-Key",
        HeaderValue::from_str(&volcengine_config.access_token)
            .map_err(|e| format!("Invalid X-Api-Access-Key header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Resource-Id",
        HeaderValue::from_str(&resource_id)
            .map_err(|e| format!("Invalid X-Api-Resource-Id header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Connect-Id",
        HeaderValue::from_str(&connect_id)
            .map_err(|e| format!("Invalid X-Api-Connect-Id header: {}", e))?,
    );

    let (ws_stream, _) = connect_async(ws_request)
        .await
        .map_err(|e| {
            if let WsError::Http(response) = &e {
                return format!("WebSocket 连接失败: HTTP {}", response.status());
            }
            format!("WebSocket 连接失败: {}", e)
        })?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    let start_conn = build_full_client_frame(EVENT_START_CONNECTION, None, b"{}");
    ws_write
        .send(Message::Binary(start_conn))
        .await
        .map_err(|e| format!("发送建连请求失败: {}", e))?;
    wait_for_event(&mut ws_read, EVENT_CONNECTION_STARTED).await?;

    let session_payload = json!({
        "user": { "uid": "reason-desktop" },
        "event": EVENT_START_SESSION,
        "namespace": "BidirectionalTTS",
        "req_params": {
            "speaker": voice,
            "audio_params": {
                "format": "mp3",
                "sample_rate": 24000
            }
        }
    });
    let session_payload_bytes =
        serde_json::to_vec(&session_payload).map_err(|e| format!("序列化请求失败: {}", e))?;
    let start_session =
        build_full_client_frame(EVENT_START_SESSION, Some(&session_id), &session_payload_bytes);
    ws_write
        .send(Message::Binary(start_session))
        .await
        .map_err(|e| format!("发送会话请求失败: {}", e))?;
    wait_for_event(&mut ws_read, EVENT_SESSION_STARTED).await?;

    let chunks = split_tts_text(&text);
    if chunks.is_empty() {
        return Err("待合成文本为空".to_string());
    }

    for (index, chunk) in chunks.iter().enumerate() {
        let task_payload = json!({
            "event": EVENT_TASK_REQUEST,
            "namespace": "BidirectionalTTS",
            "req_params": {
                "text": chunk
            }
        });
        let task_payload_bytes =
            serde_json::to_vec(&task_payload).map_err(|e| format!("序列化请求失败: {}", e))?;
        let task_request =
            build_full_client_frame(EVENT_TASK_REQUEST, Some(&session_id), &task_payload_bytes);
        ws_write
            .send(Message::Binary(task_request))
            .await
            .map_err(|e| format!("发送文本请求失败: {}", e))?;

        if index + 1 < chunks.len() {
            sleep(Duration::from_millis(TTS_STREAM_CHUNK_DELAY_MS)).await;
        }
    }

    let finish_session =
        build_full_client_frame(EVENT_FINISH_SESSION, Some(&session_id), b"{}");
    ws_write
        .send(Message::Binary(finish_session))
        .await
        .map_err(|e| format!("发送结束会话失败: {}", e))?;

    let mut total_bytes = 0usize;

    while let Some(message) = ws_read.next().await {
        let message = message.map_err(|e| format!("接收消息失败: {}", e))?;
        match message {
            Message::Binary(data) => {
                let frame = parse_frame(&data)?;
                if frame.message_type == MSG_TYPE_ERROR {
                    let payload_text = String::from_utf8_lossy(&frame.payload);
                    let message = format!("TTS 服务错误: {}", payload_text);
                    let _ = window.emit(
                        "tts-stream-error",
                        TtsStreamErrorPayload {
                            message: message.clone(),
                        },
                    );
                    return Err(message);
                }

                if frame.message_type == MSG_TYPE_AUDIO_ONLY_RESPONSE && !frame.payload.is_empty() {
                    if total_bytes == 0 {
                        println!(
                            "[TTS-WS] first audio chunk size={}",
                            frame.payload.len()
                        );
                    }
                    total_bytes += frame.payload.len();
                    let _ = window.emit(
                        "tts-stream-chunk",
                        TtsStreamChunkPayload {
                            chunk: frame.payload,
                        },
                    );
                    continue;
                }

                if let Some(event) = frame.event {
                    if event == EVENT_TTS_RESPONSE && !frame.payload.is_empty() {
                        if total_bytes == 0 {
                            println!(
                                "[TTS-WS] first audio chunk size={}",
                                frame.payload.len()
                            );
                        }
                        total_bytes += frame.payload.len();
                        let _ = window.emit(
                            "tts-stream-chunk",
                            TtsStreamChunkPayload {
                                chunk: frame.payload,
                            },
                        );
                    } else if event == EVENT_SESSION_FINISHED {
                        break;
                    } else if frame.serialization == SERIALIZATION_JSON && !frame.payload.is_empty() {
                        let payload_text = String::from_utf8_lossy(&frame.payload);
                        println!("TTS event {} payload: {}", event, payload_text);
                    }
                }
            }
            Message::Text(text) => {
                let message = format!("TTS 返回文本消息: {}", text);
                let _ = window.emit(
                    "tts-stream-error",
                    TtsStreamErrorPayload {
                        message: message.clone(),
                    },
                );
                return Err(message);
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let finish_conn = build_full_client_frame(EVENT_FINISH_CONNECTION, None, b"{}");
    let _ = ws_write.send(Message::Binary(finish_conn)).await;
    let _ = wait_for_event(&mut ws_read, EVENT_CONNECTION_FINISHED).await;

    let _ = window.emit(
        "tts-stream-finished",
        TtsStreamFinishedPayload {
            total_bytes,
        },
    );
    println!("[TTS-WS] session finished total_bytes={}", total_bytes);

    Ok(())
}
