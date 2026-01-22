use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;
use uuid::Uuid;

#[derive(Clone)]
pub struct VoiceSessionState {
    session_id: String,
    file_path: PathBuf,
}

impl VoiceSessionState {
    pub fn new() -> Result<Self, String> {
        let session_id = Uuid::new_v4().to_string();
        let file_path = voice_session_file_path(&session_id);

        Ok(Self {
            session_id,
            file_path,
        })
    }

    fn session_id(&self) -> &str {
        &self.session_id
    }

    fn file_path(&self) -> &Path {
        &self.file_path
    }
}

#[derive(Serialize)]
struct VoiceSessionRecord {
    #[serde(rename = "sessionId")]
    session_id: String,
    ts: u64,
    role: String,
    text: String,
    source: String,
}

fn voice_session_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Cannot find home directory")
        .join(".reason-code")
        .join("voice_session")
}

fn voice_session_file_path(session_id: &str) -> PathBuf {
    voice_session_dir().join(format!("{}.jsonl", session_id))
}

fn ensure_session_file(path: &Path) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create session dir: {}", e))?;
    }

    OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    Ok(())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub async fn voice_session_start(state: State<'_, VoiceSessionState>) -> Result<String, String> {
    ensure_session_file(state.file_path())?;
    Ok(state.session_id().to_string())
}

#[tauri::command]
pub async fn voice_session_append(
    state: State<'_, VoiceSessionState>,
    role: String,
    text: String,
    source: String,
) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(());
    }

    ensure_session_file(state.file_path())?;

    let record = VoiceSessionRecord {
        session_id: state.session_id().to_string(),
        ts: now_ms(),
        role,
        text: trimmed.to_string(),
        source,
    };

    let line = serde_json::to_string(&record)
        .map_err(|e| format!("Failed to serialize session record: {}", e))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(state.file_path())
        .map_err(|e| format!("Failed to open session file: {}", e))?;

    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|e| format!("Failed to write session record: {}", e))?;

    Ok(())
}
