use serde_json::Value;
use std::process::Command;

#[tauri::command]
fn turn_on_career_loop(portals: Value) -> Result<Value, String> {
    // Bridge to the Node core package shipped next to the app in v0.
    // For now: write portals JSON to a temp file and invoke `node` against
    // a small runner. If node/core is unavailable, return a structured stub
    // so the UI still completes the primary action path in development.
    let portals_json = serde_json::to_string(&portals).map_err(|e| e.to_string())?;
    let script = r#"
import { turnOnCareerLoop } from '@career-loop/core/loop';
const portals = JSON.parse(process.argv[1]);
const result = await turnOnCareerLoop({ portals });
console.log(JSON.stringify(result));
"#;
    let tmp = std::env::temp_dir().join("career-loop-turnon.mjs");
    std::fs::write(&tmp, script).map_err(|e| e.to_string())?;

    let output = Command::new("node")
        .arg(&tmp)
        .arg(&portals_json)
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let last = stdout.lines().last().unwrap_or("{}");
            serde_json::from_str(last).map_err(|e| e.to_string())
        }
        Ok(out) => {
            let err = String::from_utf8_lossy(&out.stderr);
            Err(format!("node turn-on failed: {err}"))
        }
        Err(e) => {
            // Dev fallback when Node resolution isn't wired yet
            Ok(serde_json::json!({
                "ok": true,
                "primary_action": "Turn on Career Loop",
                "scan": { "new_count": 0, "errors": [], "providers_stub": true },
                "digest": {
                    "claimed_email_sent": false,
                    "empty": true,
                    "notify": "stubbed-in-rust-fallback",
                    "paths": {}
                },
                "schedule": {
                    "detail": format!("rust-fallback: {e} — install deps and retry"),
                    "user_copies_plist": false,
                    "catch_up_on_wake": true
                },
                "portals": portals,
            }))
        }
    }
}

#[tauri::command]
fn data_plane_path() -> String {
    let home = dirs_home();
    if cfg!(target_os = "macos") {
        format!("{home}/Library/Application Support/CareerLoop")
    } else if cfg!(target_os = "windows") {
        format!("{home}/AppData/Roaming/CareerLoop")
    } else {
        format!("{home}/.local/share/CareerLoop")
    }
}

fn dirs_home() -> String {
    std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![turn_on_career_loop, data_plane_path])
        .run(tauri::generate_context!())
        .expect("error while running Career Loop");
}
