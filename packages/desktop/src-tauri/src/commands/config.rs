use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 火山引擎 TTS 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TtsConfig {
    #[serde(rename = "resourceId", default)]
    pub resource_id: String,
    #[serde(rename = "voiceType")]
    pub voice_type: String,
    pub cluster: String,
}

impl Default for TtsConfig {
    fn default() -> Self {
        Self {
            resource_id: String::new(),
            voice_type: "zh_female_tianmeixiaoyuan_moon_bigtts".to_string(),
            cluster: "volcano_tts".to_string(),
        }
    }
}

/// 火山引擎 STT 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SttConfig {
    #[serde(rename = "resourceId", default)]
    pub resource_id: String,
}

impl Default for SttConfig {
    fn default() -> Self {
        Self {
            resource_id: String::new(),
        }
    }
}

/// 火山引擎配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VolcengineConfig {
    #[serde(rename = "appId")]
    pub app_id: String,
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "resourceId", default, skip_serializing_if = "Option::is_none")]
    pub legacy_resource_id: Option<String>,
    #[serde(default)]
    pub stt: SttConfig,
    pub tts: TtsConfig,
}

impl Default for VolcengineConfig {
    fn default() -> Self {
        Self {
            app_id: String::new(),
            access_token: String::new(),
            legacy_resource_id: None,
            stt: SttConfig::default(),
            tts: TtsConfig::default(),
        }
    }
}

/// 完整配置文件结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReasonConfig {
    #[serde(default)]
    pub model: serde_json::Value, //表示任意JSON的值
    #[serde(default)]
    pub providers: serde_json::Value,
    #[serde(default)]
    pub volcengine: Option<VolcengineConfig>,
    #[serde(default)]
    pub agent: serde_json::Value,
    #[serde(default)]
    pub ui: serde_json::Value,
    #[serde(default)]
    pub session: serde_json::Value,
}

/// 获取配置文件路径
fn get_config_path() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot find home directory")
        .join(".reason-code")
        .join("config.json")
}

/// 读取配置文件
fn read_config() -> Result<ReasonConfig, String> {
    let path = get_config_path();

    if !path.exists() {
        return Err("Config file not found".to_string());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
}

/// 写入配置文件
fn write_config(config: &ReasonConfig) -> Result<(), String> {
    let path = get_config_path();

    // 确保目录存在 - 如果path.parent()存在的话，就执行{}中的代码
    if let Some(parent) = path.parent() {
        //执行创建目录的操作，如果出现错误就执行map_err中的代码，并且?是直接返回函数
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }

    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))
}

/// 获取火山引擎配置
#[tauri::command]
pub async fn get_volcengine_config() -> Result<VolcengineConfig, String> {
    let config = read_config()?;
    Ok(config.volcengine.unwrap_or_default())
}

/// 保存火山引擎配置
#[tauri::command]
pub async fn save_volcengine_config(config: VolcengineConfig) -> Result<(), String> {
    //读取配置文件，如果read_config失败，则返回一个默认配置
    let mut full_config = read_config().unwrap_or_else(|_| ReasonConfig {
        model: serde_json::Value::Null,
        providers: serde_json::Value::Null,
        volcengine: None,
        agent: serde_json::Value::Null,
        ui: serde_json::Value::Null,
        session: serde_json::Value::Null,
    });

    full_config.volcengine = Some(config);

    write_config(&full_config)
}
