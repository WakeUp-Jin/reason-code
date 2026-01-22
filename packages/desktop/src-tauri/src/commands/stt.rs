use crate::commands::config::get_volcengine_config;
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

/// STT 请求参数
#[derive(Debug, Serialize)]
struct SttRequest {
    app: SttAppConfig,
    user: SttUserConfig,
    audio: SttAudioConfig,
    request: SttRequestConfig,
}

#[derive(Debug, Serialize)]
struct SttAppConfig {
    appid: String,
    cluster: String,
    token: String,
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
    reqid: String,
    workflow: String,
    #[serde(rename = "show_utterances")]
    show_utterances: bool,
    result_type: String,
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
fn build_full_client_request(config: &SttRequest, audio_data: &[u8]) -> Vec<u8> {
    let header = serde_json::to_vec(&config).unwrap();
    let audio_base64 = STANDARD.encode(audio_data);

    // 构建二进制协议消息
    // Protocol: [header_size(4 bytes)][header][payload_size(4 bytes)][payload]
    let header_size = (header.len() as u32).to_be_bytes();
    let payload = audio_base64.as_bytes();
    let payload_size = (payload.len() as u32).to_be_bytes();

    let mut message = Vec::new();
    // Protocol version and flags
    message.push(0x11); // Version
    message.push(0x10); // Header size indicator
    message.push(0x11); // Message type: full client request
    message.push(0x00); // Reserved

    message.extend_from_slice(&header_size);
    message.extend_from_slice(&header);
    message.extend_from_slice(&payload_size);
    message.extend_from_slice(payload);

    message
}

/// 语音识别
#[tauri::command]
pub async fn stt_transcribe(audio_bytes: Vec<u8>, _mime_type: String) -> Result<String, String> {
    // 获取配置
    let volcengine_config = get_volcengine_config().await?;

    if volcengine_config.app_id.is_empty() || volcengine_config.access_token.is_empty() {
        return Err("请先在设置中配置火山引擎 API".to_string());
    }

    // 构建请求
    let request = SttRequest {
        app: SttAppConfig {
            appid: volcengine_config.app_id.clone(),
            cluster: "volcengine_streaming_common".to_string(),
            token: volcengine_config.access_token.clone(),
        },
        user: SttUserConfig {
            uid: "reason-desktop".to_string(),
        },
        audio: SttAudioConfig {
            format: "webm".to_string(),
            codec: "opus".to_string(),
            rate: 16000,
            bits: 16,
            channel: 1,
        },
        request: SttRequestConfig {
            reqid: Uuid::new_v4().to_string(),
            workflow: "audio_in,resample,partition,vad,fe,decode".to_string(),
            show_utterances: true,
            result_type: "single".to_string(),
        },
    };

    // 连接 WebSocket
    let url = format!(
        "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel?appid={}&token={}",
        volcengine_config.app_id, volcengine_config.access_token
    );

    let (ws_stream, _) = connect_async(&url)
        .await
        .map_err(|e| format!("WebSocket 连接失败: {}", e))?;

    let (mut write, mut read) = ws_stream.split();

    // 发送音频数据
    let message = build_full_client_request(&request, &audio_bytes);
    write
        .send(Message::Binary(message))
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
                // 解析二进制响应
                if data.len() > 8 {
                    // 跳过协议头，尝试解析 JSON
                    if let Ok(text) = String::from_utf8(data[8..].to_vec()) {
                        if let Ok(response) = serde_json::from_str::<SttResponse>(&text) {
                            if let Some(result) = response.result {
                                transcript = result.text;
                            }
                        }
                    }
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
