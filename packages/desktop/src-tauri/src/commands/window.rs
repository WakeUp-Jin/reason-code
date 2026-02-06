use tauri::{LogicalPosition, LogicalSize, Manager};

/// 设置窗口大小
#[tauri::command]
pub async fn set_window_size(
    app: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 设置窗口位置
#[tauri::command]
pub async fn set_window_position(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;

    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 设置窗口是否可调整大小
#[tauri::command]
pub async fn set_window_resizable(
    app: tauri::AppHandle,
    resizable: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Window not found")?;

    window
        .set_resizable(resizable)
        .map_err(|e| e.to_string())?;

    Ok(())
}
