use crate::commands::config::get_volcengine_config;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::error::Error as WsError;
use tokio_tungstenite::tungstenite::http::header::HeaderValue;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

/// STT 请求参数
#[derive(Debug, Serialize)]
struct SttRequest {
    user: SttUserConfig,
    audio: SttAudioConfig,
    request: SttRequestConfig,
}

#[derive(Debug, Serialize)]
struct SttUserConfig {
    uid: String,
}

#[derive(Debug, Serialize)]
struct SttAudioConfig {
    format: String,
    codec: String,
    rate: i32,
    bits: i32,
    channel: i32,
}

#[derive(Debug, Serialize)]
struct SttRequestConfig {
    model_name: String,
    #[serde(rename = "show_utterances")]
    show_utterances: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_itn: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    enable_punc: Option<bool>,
}

/// STT 响应
#[derive(Debug, Deserialize)]
struct SttResponse {
    #[serde(default)]
    result: Option<SttResult>,
    #[serde(default)]
    code: i32,
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct SttResult {
    #[serde(default)]
    text: String,
}

/// WebSocket 消息构建
fn build_full_client_request(config: &SttRequest) -> Vec<u8> {
    let payload = serde_json::to_vec(&config).unwrap();
    let payload_size = (payload.len() as u32).to_be_bytes();

    let mut message = Vec::with_capacity(8 + payload.len());
    message.push(0x11);
    message.push(0x10);
    message.push(0x10);
    message.push(0x00);
    message.extend_from_slice(&payload_size);
    message.extend_from_slice(&payload);
    message
}

fn build_audio_only_request(audio_data: &[u8], is_last: bool) -> Vec<u8> {
    let payload_size = (audio_data.len() as u32).to_be_bytes();
    let flags = if is_last { 0x02 } else { 0x00 };

    let mut message = Vec::with_capacity(8 + audio_data.len());
    message.push(0x11);
    message.push(0x20 | flags);
    message.push(0x00);
    message.push(0x00);
    message.extend_from_slice(&payload_size);
    message.extend_from_slice(audio_data);
    message
}

fn parse_server_payload(data: &[u8]) -> Result<Option<String>, String> {
    if data.len() < 12 {
        return Ok(None);
    }
    let header_size = ((data[0] & 0x0f) as usize) * 4;
    if data.len() < header_size + 8 {
        return Ok(None);
    }

    let message_type = data[1] >> 4;
    let serialization = data[2] >> 4;
    let compression = data[2] & 0x0f;
    if compression != 0 {
        return Err("Unsupported compression in server response".to_string());
    }
    if serialization != 0x01 && serialization != 0x00 {
        return Err("Unsupported serialization in server response".to_string());
    }

    let payload_size_offset = header_size + 4;
    if data.len() < payload_size_offset + 4 {
        return Ok(None);
    }

    let payload_size = u32::from_be_bytes([
        data[payload_size_offset],
        data[payload_size_offset + 1],
        data[payload_size_offset + 2],
        data[payload_size_offset + 3],
    ]) as usize;

    let payload_offset = header_size + 8;
    if data.len() < payload_offset + payload_size {
        return Ok(None);
    }

    let payload = &data[payload_offset..payload_offset + payload_size];
    let payload_text = String::from_utf8_lossy(payload).to_string();

    if message_type == 0b1111 {
        return Err(format!("Server error response: {}", payload_text));
    }

    Ok(Some(payload_text))
}

fn parse_audio_format(mime_type: &str) -> Result<(String, String), String> {
    let mime = mime_type.to_lowercase();
    if mime.contains("webm") {
        let codec = if mime.contains("opus") { "opus" } else { "opus" };
        return Ok(("webm".to_string(), codec.to_string()));
    }
    if mime.contains("ogg") {
        let codec = if mime.contains("opus") { "opus" } else { "opus" };
        return Ok(("ogg".to_string(), codec.to_string()));
    }
    if mime.contains("mp4") || mime.contains("m4a") || mime.contains("aac") {
        let codec = if mime.contains("aac") { "aac" } else { "aac" };
        return Ok(("mp4".to_string(), codec.to_string()));
    }
    if mime.contains("mpeg") || mime.contains("mp3") {
        return Ok(("mp3".to_string(), "raw".to_string()));
    }
    if mime.contains("wav") {
        return Ok(("wav".to_string(), "raw".to_string()));
    }
    if mime.contains("pcm") {
        return Ok(("pcm".to_string(), "raw".to_string()));
    }
    if mime.is_empty() {
        return Ok(("webm".to_string(), "opus".to_string()));
    }

    Err(format!("不支持的音频格式: {}", mime_type))
}

/// 语音识别
#[tauri::command]
pub async fn stt_transcribe(audio_bytes: Vec<u8>, mime_type: String) -> Result<String, String> {
    // 获取配置
    let volcengine_config = get_volcengine_config().await?;

    if volcengine_config.app_id.is_empty() || volcengine_config.access_token.is_empty() {
        return Err("请先在设置中配置火山引擎 API".to_string());
    }
    let resource_id = if !volcengine_config.stt.resource_id.is_empty() {
        volcengine_config.stt.resource_id.clone()
    } else {
        volcengine_config
            .legacy_resource_id
            .clone()
            .unwrap_or_default()
    };
    if resource_id.is_empty() {
        return Err("请先在设置中配置火山引擎语音识别资源 ID".to_string());
    }

    let (format, codec) = parse_audio_format(&mime_type)?;

    // 构建请求
    let request = SttRequest {
        user: SttUserConfig {
            uid: "reason-desktop".to_string(),
        },
        audio: SttAudioConfig {
            format,
            codec,
            rate: 16000,
            bits: 16,
            channel: 1,
        },
        request: SttRequestConfig {
            model_name: "bigmodel".to_string(),
            show_utterances: true,
            enable_itn: None,
            enable_punc: None,
        },
    };

    // 连接 WebSocket
    let url = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async".to_string();
    let mut ws_request = url
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
        HeaderValue::from_str(&Uuid::new_v4().to_string())
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

    let (mut write, mut read) = ws_stream.split();

    // 发送音频数据
    let message = build_full_client_request(&request);
    write
        .send(Message::Binary(message))
        .await
        .map_err(|e| format!("发送请求失败: {}", e))?;
    let audio_message = build_audio_only_request(&audio_bytes, true);
    write
        .send(Message::Binary(audio_message))
        .await
        .map_err(|e| format!("发送音频数据失败: {}", e))?;

    // 接收识别结果
    let mut transcript = String::new();

    while let Some(msg) = read.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                if let Ok(response) = serde_json::from_str::<SttResponse>(&text) {
                    if response.code != 0 {
                        return Err(format!("识别失败: {}", response.message));
                    }
                    if let Some(result) = response.result {
                        transcript = result.text;
                    }
                }
            }
            Ok(Message::Binary(data)) => {
                match parse_server_payload(&data) {
                    Ok(Some(text)) => {
                        if let Ok(response) = serde_json::from_str::<SttResponse>(&text) {
                            if response.code != 0 {
                                return Err(format!("识别失败: {}", response.message));
                            }
                            if let Some(result) = response.result {
                                transcript = result.text;
                            }
                        }
                    }
                    Ok(None) => {}
                    Err(e) => return Err(e),
                }
            }
            Ok(Message::Close(_)) => break,
            Err(e) => {
                return Err(format!("接收消息失败: {}", e));
            }
            _ => {}
        }
    }

    Ok(transcript)
}
