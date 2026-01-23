// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{agent, config, stt, tts, voice_session, window};

fn main() {
    //1. 初始化语音会话
    let voice_session_state =
        voice_session::VoiceSessionState::new().expect("Failed to init voice session");

    //2. 构建 Tauri 应用
    tauri::Builder::default()
        .manage(voice_session_state)
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            // 配置管理
            config::get_volcengine_config,
            config::save_volcengine_config,
            // 语音识别
            stt::stt_transcribe,
            // Agent 调用
            agent::agent_run,
            // 语音合成
            tts::tts_speak,
            tts::tts_speak_stream,
            // 语音会话记录
            voice_session::voice_session_start,
            voice_session::voice_session_append,
            // 窗口控制
            window::set_window_size,
            window::set_window_position,
            window::set_window_resizable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
