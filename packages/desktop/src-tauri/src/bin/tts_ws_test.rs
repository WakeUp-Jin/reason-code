use futures_util::{stream::Stream, SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::json;
use std::{env, fs, path::PathBuf};
use tokio::io::AsyncWriteExt;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::connect_async;
use uuid::Uuid;

const WS_ENDPOINT: &str = "wss://openspeech.bytedance.com/api/v3/tts/bidirection";

const PROTOCOL_VERSION: u8 = 0x1;
const HEADER_SIZE: u8 = 0x1;

const MSG_TYPE_FULL_CLIENT: u8 = 0x1;
const MSG_TYPE_AUDIO_ONLY_REQUEST: u8 = 0x2;
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
const EVENT_TTS_SENTENCE_START: i32 = 350;
const EVENT_TTS_SENTENCE_END: i32 = 351;
const EVENT_TTS_RESPONSE: i32 = 352;

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
    #[serde(rename = "resourceId", default)]
    legacy_resource_id: Option<String>,
    #[serde(default)]
    tts: TtsConfig,
}

#[derive(Debug, Deserialize)]
struct TtsConfig {
    #[serde(rename = "resourceId", default)]
    resource_id: String,
    #[serde(rename = "voiceType")]
    voice_type: String,
    #[serde(default)]
    cluster: String,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            resource_id: String::new(),
            voice_type: "zh_male_m191_uranus_bigtts".to_string(),
            cluster: "volcano_tts".to_string(),
        }
    }
}

struct Args {
    text: String,
    output: PathBuf,
}

#[derive(Debug)]
struct ParsedFrame {
    message_type: u8,
    flags: u8,
    serialization: u8,
    event: Option<i32>,
    id: Option<String>,
    payload: Vec<u8>,
}

fn parse_args() -> Result<Args, String> {
    let mut args = env::args().skip(1);
    let mut text = None;
    let mut output = None;

    while let Some(arg) = args.next() {
        if arg == "-h" || arg == "--help" {
            print_usage();
            std::process::exit(0);
        }

        if text.is_none() {
            text = Some(arg);
        } else if output.is_none() {
            output = Some(PathBuf::from(arg));
        } else {
            return Err(format!("Unexpected argument: {}", arg));
        }
    }

    Ok(Args {
        text: text.unwrap_or_else(|| "This is a websocket TTS test.".to_string()),
        output: output.unwrap_or_else(|| PathBuf::from("tts_ws_test_output.mp3")),
    })
}

fn print_usage() {
    println!("Usage: cargo run --bin tts_ws_test -- \"TEXT\" [OUTPUT_PATH]");
    println!("Example: cargo run --bin tts_ws_test -- \"Hello\" /tmp/tts_ws_test.mp3");
}

fn read_volcengine_config() -> Result<(VolcengineConfig, String), String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "Cannot find home directory".to_string())?
        .join(".reason-code")
        .join("config.json");
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let config: ReasonConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    let volcengine = config
        .volcengine
        .ok_or_else(|| "Missing volcengine config".to_string())?;

    if volcengine.app_id.is_empty() || volcengine.access_token.is_empty() {
        return Err("Volcengine config is missing appId/accessToken".to_string());
    }

    let resource_id = if !volcengine.tts.resource_id.is_empty() {
        volcengine.tts.resource_id.clone()
    } else {
        volcengine.legacy_resource_id.clone().unwrap_or_default()
    };
    if resource_id.is_empty() {
        return Err("Volcengine config is missing TTS resourceId".to_string());
    }

    Ok((volcengine, resource_id))
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
            id: None,
            payload,
        });
    }

    let mut id = None;
    if offset + 4 <= data.len() {
        let id_len = u32::from_be_bytes([
            data[offset],
            data[offset + 1],
            data[offset + 2],
            data[offset + 3],
        ]) as usize;
        offset += 4;

        if offset + id_len <= data.len() && id_len > 0 {
            id = Some(String::from_utf8_lossy(&data[offset..offset + id_len]).to_string());
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
        id,
        payload,
    })
}

async fn wait_for_event<S>(
    ws_read: &mut S,
    target_event: i32,
) -> Result<(), Box<dyn std::error::Error>>
where
    S: Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    while let Some(message) = ws_read.next().await {
        let message = message?;
        match message {
            Message::Binary(data) => {
                let frame = parse_frame(&data)?;
                if let Some(event) = frame.event {
                    if event == target_event {
                        return Ok(());
                    }
                }
            }
            Message::Text(text) => {
                println!("Text message: {}", text);
            }
            Message::Close(_) => return Err("Connection closed".into()),
            _ => {}
        }
    }

    Err("Connection ended".into())
}

async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = parse_args().map_err(|e| format!("Argument error: {}", e))?;
    let (config, resource_id) = read_volcengine_config()?;

    let connect_id = Uuid::new_v4().to_string();
    let session_id = Uuid::new_v4().to_string();

    let mut request = WS_ENDPOINT.into_client_request()?;
    let headers = request.headers_mut();
    headers.insert("X-Api-App-Key", config.app_id.parse()?);
    headers.insert("X-Api-Access-Key", config.access_token.parse()?);
    headers.insert("X-Api-Resource-Id", resource_id.parse()?);
    headers.insert("X-Api-Connect-Id", connect_id.parse()?);

    let (ws_stream, _) = connect_async(request).await?;
    let (mut ws_write, mut ws_read) = ws_stream.split();

    let start_conn = build_full_client_frame(EVENT_START_CONNECTION, None, b"{}");
    ws_write.send(Message::Binary(start_conn)).await?;
    wait_for_event(&mut ws_read, EVENT_CONNECTION_STARTED).await?;
    println!("Connection started");

    let session_payload = json!({
        "user": { "uid": "reason-desktop" },
        "event": EVENT_START_SESSION,
        "namespace": "BidirectionalTTS",
        "req_params": {
            "speaker": config.tts.voice_type,
            "audio_params": {
                "format": "mp3",
                "sample_rate": 24000
            }
        }
    });
    let session_payload_bytes = serde_json::to_vec(&session_payload)?;
    let start_session =
        build_full_client_frame(EVENT_START_SESSION, Some(&session_id), &session_payload_bytes);
    ws_write.send(Message::Binary(start_session)).await?;
    wait_for_event(&mut ws_read, EVENT_SESSION_STARTED).await?;
    println!("Session started");

    let task_payload = json!({
        "event": EVENT_TASK_REQUEST,
        "namespace": "BidirectionalTTS",
        "req_params": {
            "text": args.text
        }
    });
    let task_payload_bytes = serde_json::to_vec(&task_payload)?;
    let task_request =
        build_full_client_frame(EVENT_TASK_REQUEST, Some(&session_id), &task_payload_bytes);
    ws_write.send(Message::Binary(task_request)).await?;

    let finish_session =
        build_full_client_frame(EVENT_FINISH_SESSION, Some(&session_id), b"{}");
    ws_write.send(Message::Binary(finish_session)).await?;

    let mut output_file = tokio::fs::File::create(&args.output).await?;
    let mut audio_bytes = 0usize;

    while let Some(message) = ws_read.next().await {
        let message = message?;
        match message {
            Message::Binary(data) => {
                let frame = parse_frame(&data)?;
                if let Some(event) = frame.event {
                    match event {
                        EVENT_TTS_SENTENCE_START => {
                            println!("Sentence start");
                        }
                        EVENT_TTS_SENTENCE_END => {
                            println!("Sentence end");
                        }
                        EVENT_TTS_RESPONSE => {
                            if !frame.payload.is_empty() {
                                output_file.write_all(&frame.payload).await?;
                                audio_bytes += frame.payload.len();
                            }
                        }
                        EVENT_SESSION_FINISHED => {
                            println!("Session finished");
                            break;
                        }
                        _ => {
                            if frame.serialization == SERIALIZATION_JSON && !frame.payload.is_empty()
                            {
                                let payload_text = String::from_utf8_lossy(&frame.payload);
                                println!("Event {} payload: {}", event, payload_text);
                            }
                        }
                    }
                } else if frame.message_type == MSG_TYPE_AUDIO_ONLY_RESPONSE
                    || frame.message_type == MSG_TYPE_AUDIO_ONLY_REQUEST
                {
                    if !frame.payload.is_empty() {
                        output_file.write_all(&frame.payload).await?;
                        audio_bytes += frame.payload.len();
                    }
                }
            }
            Message::Text(text) => {
                println!("Text message: {}", text);
            }
            Message::Close(_) => break,
            _ => {}
        }
    }

    let finish_conn = build_full_client_frame(EVENT_FINISH_CONNECTION, None, b"{}");
    ws_write.send(Message::Binary(finish_conn)).await?;
    let _ = wait_for_event(&mut ws_read, EVENT_CONNECTION_FINISHED).await;

    output_file.flush().await?;
    println!(
        "Saved audio to {} ({} bytes)",
        args.output.display(),
        audio_bytes
    );

    Ok(())
}

#[tokio::main]
async fn main() {
    if let Err(error) = run().await {
        eprintln!("TTS websocket test failed: {}", error);
        std::process::exit(1);
    }
}
