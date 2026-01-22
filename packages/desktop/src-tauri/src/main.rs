// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::{agent, config, stt, tts, window};

fn main() {
    tauri::Builder::default()
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
            // 窗口控制
            window::set_window_size,
            window::set_window_position,
            window::set_window_resizable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
