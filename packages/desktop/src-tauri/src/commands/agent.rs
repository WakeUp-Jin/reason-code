use serde::Serialize;
use std::process::Stdio;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Agent 输出事件
#[derive(Clone, Serialize)]
pub struct AgentOutputPayload {
    pub chunk: String,
}

/// Agent 完成事件
#[derive(Clone, Serialize)]
pub struct AgentFinishedPayload {
    #[serde(rename = "fullText")]
    pub full_text: String,
}

/// Agent 错误事件
#[derive(Clone, Serialize)]
pub struct AgentErrorPayload {
    pub message: String,
}

/// 调用 reason CLI
#[tauri::command]
pub async fn agent_run(app: tauri::AppHandle, prompt: String) -> Result<String, String> {
    // 启动 reason CLI 进程
    let mut child = Command::new("reason")
        .arg("-m")
        .arg("steward")
        .arg("-p")
        .arg(&prompt)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动 reason CLI 失败: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("无法获取 stdout")?;

    let stderr = child
        .stderr
        .take()
        .ok_or("无法获取 stderr")?;

    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;

    let mut full_output = String::new();

    // 异步读取 stdout
    let stdout_reader = BufReader::new(stdout);
    let mut lines = stdout_reader.lines();

    // 流式读取输出
    while let Ok(Some(line)) = lines.next_line().await {
        let chunk = format!("{}\n", line);
        full_output.push_str(&chunk);

        // 发送到前端
        let _ = window.emit(
            "agent-output",
            AgentOutputPayload {
                chunk: chunk.clone(),
            },
        );
    }

    // 等待进程结束
    let status = child
        .wait()
        .await
        .map_err(|e| format!("等待进程失败: {}", e))?;

    if !status.success() {
        // 读取 stderr
        let stderr_reader = BufReader::new(stderr);
        let mut stderr_lines = stderr_reader.lines();
        let mut error_output = String::new();

        while let Ok(Some(line)) = stderr_lines.next_line().await {
            error_output.push_str(&line);
            error_output.push('\n');
        }

        let error_message = if error_output.is_empty() {
            format!("进程退出码: {}", status.code().unwrap_or(-1))
        } else {
            error_output
        };

        // 发送错误事件
        let _ = window.emit(
            "agent-error",
            AgentErrorPayload {
                message: error_message.clone(),
            },
        );

        return Err(error_message);
    }

    // 发送完成事件
    let _ = window.emit(
        "agent-finished",
        AgentFinishedPayload {
            full_text: full_output.clone(),
        },
    );

    Ok(full_output)
}
