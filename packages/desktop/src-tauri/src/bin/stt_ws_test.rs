use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{env, fs, path::Path};
use tokio::time::{timeout_at, Duration, Instant};
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::error::Error as WsError;
use tokio_tungstenite::tungstenite::http::header::HeaderValue;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
struct ReasonConfig {
    #[serde(default)]
    volcengine: Option<VolcengineConfig>,
}

#[derive(Debug, Deserialize)]
struct VolcengineConfig {
    #[serde(rename = "appId")]
    app_id: String,
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "resourceId")]
    resource_id: String,
}

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

fn read_volcengine_config() -> Result<VolcengineConfig, String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "Cannot find home directory".to_string())?
        .join(".reason-code")
        .join("config.json");
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read config: {}", e))?;
    let config: ReasonConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    config
        .volcengine
        .ok_or_else(|| "Missing volcengine config".to_string())
}

fn build_full_client_request(config: &SttRequest) -> Vec<u8> {
    let payload = serde_json::to_vec(config).unwrap();
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

fn parse_audio_format(path: &Path) -> Result<(String, String), String> {
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext == "webm" {
        return Ok(("webm".to_string(), "opus".to_string()));
    }
    if ext == "ogg" {
        return Ok(("ogg".to_string(), "opus".to_string()));
    }
    if ext == "mp4" || ext == "m4a" {
        return Ok(("mp4".to_string(), "aac".to_string()));
    }
    if ext == "mp3" {
        return Ok(("mp3".to_string(), "raw".to_string()));
    }
    if ext == "wav" {
        return Ok(("wav".to_string(), "raw".to_string()));
    }
    if ext == "pcm" {
        return Ok(("pcm".to_string(), "raw".to_string()));
    }
    if ext.is_empty() {
        return Ok(("webm".to_string(), "opus".to_string()));
    }
    Err(format!("Unsupported audio extension: {}", ext))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let audio_path = match env::args().nth(1) {
        Some(path) => path,
        None => {
            eprintln!(
                "Usage: stt_ws_test <audio_path>\nEnv: VOLC_WS_URL, VOLC_WS_PROTOCOL, VOLC_WS_AUTH"
            );
            return Ok(());
        }
    };

    let audio_path = Path::new(&audio_path);
    let audio_bytes = fs::read(audio_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    let (format, codec) = parse_audio_format(audio_path)?;

    let config = read_volcengine_config()?;
    if config.app_id.is_empty() || config.access_token.is_empty() {
        return Err("Missing appId or accessToken in config".into());
    }
    if config.resource_id.is_empty() {
        return Err("Missing resourceId in config".into());
    }

    let request = SttRequest {
        user: SttUserConfig {
            uid: "stt-ws-test".to_string(),
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

    let default_url = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async".to_string();
    let url = env::var("VOLC_WS_URL").unwrap_or(default_url);

    let mut ws_request = url
        .into_client_request()
        .map_err(|e| format!("Failed to build WS request: {}", e))?;

    ws_request.headers_mut().insert(
        "X-Api-App-Key",
        HeaderValue::from_str(&config.app_id)
            .map_err(|e| format!("Invalid X-Api-App-Key header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Access-Key",
        HeaderValue::from_str(&config.access_token)
            .map_err(|e| format!("Invalid X-Api-Access-Key header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Resource-Id",
        HeaderValue::from_str(&config.resource_id)
            .map_err(|e| format!("Invalid X-Api-Resource-Id header: {}", e))?,
    );
    ws_request.headers_mut().insert(
        "X-Api-Connect-Id",
        HeaderValue::from_str(&Uuid::new_v4().to_string())
            .map_err(|e| format!("Invalid X-Api-Connect-Id header: {}", e))?,
    );

    if let Ok(protocol) = env::var("VOLC_WS_PROTOCOL") {
        let value = HeaderValue::from_str(&protocol)
            .map_err(|e| format!("Invalid Sec-WebSocket-Protocol: {}", e))?;
        ws_request
            .headers_mut()
            .insert("Sec-WebSocket-Protocol", value);
    }
    if let Ok(auth) = env::var("VOLC_WS_AUTH") {
        let value = HeaderValue::from_str(&auth)
            .map_err(|e| format!("Invalid Authorization header: {}", e))?;
        ws_request.headers_mut().insert("Authorization", value);
    }

    let (ws_stream, response) = match connect_async(ws_request).await {
        Ok(result) => result,
        Err(e) => {
            if let WsError::Http(response) = &e {
                eprintln!("Handshake response: {:?}", response);
            }
            return Err(format!("WebSocket connect failed: {}", e).into());
        }
    };

    println!("WebSocket connected: {}", response.status());

    let (mut write, mut read) = ws_stream.split();
    let message = build_full_client_request(&request);
    write
        .send(Message::Binary(message))
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;
    let audio_message = build_audio_only_request(&audio_bytes, true);
    write
        .send(Message::Binary(audio_message))
        .await
        .map_err(|e| format!("Failed to send audio data: {}", e))?;

    let mut transcript = String::new();
    let deadline = Instant::now() + Duration::from_secs(15);
    loop {
        match timeout_at(deadline, read.next()).await {
            Ok(Some(Ok(Message::Text(text)))) => {
                if let Ok(response) = serde_json::from_str::<SttResponse>(&text) {
                    if response.code != 0 {
                        return Err(format!("Recognition error: {}", response.message).into());
                    }
                    if let Some(result) = response.result {
                        transcript = result.text;
                    }
                } else {
                    eprintln!("Text response (unparsed): {}", text);
                }
            }
            Ok(Some(Ok(Message::Binary(data)))) => {
                match parse_server_payload(&data) {
                    Ok(Some(text)) => {
                        if let Ok(response) = serde_json::from_str::<SttResponse>(&text) {
                            if response.code != 0 {
                                return Err(format!("Recognition error: {}", response.message).into());
                            }
                            if let Some(result) = response.result {
                                transcript = result.text;
                            }
                        } else {
                            eprintln!("Binary response (unparsed): {}", text);
                        }
                    }
                    Ok(None) => {}
                    Err(e) => return Err(e.into()),
                }
            }
            Ok(Some(Ok(Message::Close(_)))) => break,
            Ok(Some(Err(e))) => return Err(format!("Read error: {}", e).into()),
            Ok(None) => break,
            Err(_) => {
                eprintln!("Timed out waiting for response");
                break;
            }
            _ => {}
        }
    }

    if transcript.is_empty() {
        eprintln!("No transcript returned");
    } else {
        println!("Transcript: {}", transcript);
    }

    Ok(())
}
