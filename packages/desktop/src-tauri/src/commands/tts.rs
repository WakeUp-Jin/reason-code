use crate::commands::config::get_volcengine_config;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

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

    if tts_response.code != 0 {
        return Err(format!("TTS 失败: {}", tts_response.message));
    }

    let audio_base64 = tts_response.data.ok_or("无音频数据返回")?;

    // 解码 Base64
    let audio_bytes = STANDARD
        .decode(&audio_base64)
        .map_err(|e| format!("解码音频失败: {}", e))?;

    Ok(audio_bytes)
}
