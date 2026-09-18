use serde_json::{json, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

enum CoreInvokeError {
    Unavailable(String),
    Failed(String),
}

fn resolve_bridge() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("CAREER_LOOP_BRIDGE") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }

    let compiled = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/core/src/bridge.mjs");
    if compiled.is_file() {
        return Some(compiled);
    }

    if let Ok(mut dir) = std::env::current_dir() {
        for _ in 0..8 {
            let candidate = dir.join("packages/core/src/bridge.mjs");
            if candidate.is_file() {
                return Some(candidate);
            }
            if !dir.pop() {
                break;
            }
        }
    }
    None
}

fn invoke_core(command: &str, payload: &Value) -> Result<Value, CoreInvokeError> {
    let bridge = resolve_bridge()
        .ok_or_else(|| CoreInvokeError::Unavailable("core bridge not found".into()))?;
    let payload_json =
        serde_json::to_vec(payload).map_err(|e| CoreInvokeError::Failed(e.to_string()))?;

    let mut child = Command::new("node")
        .arg(&bridge)
        .arg(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| CoreInvokeError::Unavailable(e.to_string()))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&payload_json)
            .map_err(|e| CoreInvokeError::Failed(e.to_string()))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| CoreInvokeError::Failed(e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(CoreInvokeError::Failed(format!(
            "node {command} failed: {err}"
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let last = stdout.lines().last().unwrap_or("{}");
    serde_json::from_str(last).map_err(|e| CoreInvokeError::Failed(e.to_string()))
}

fn as_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string().trim_matches('"').to_string(),
        None => String::new(),
    }
}

fn list_from(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .flat_map(|v| list_from(Some(v)))
            .collect(),
        Some(Value::String(s)) => s
            .split(|c| matches!(c, ',' | ';' | '\n' | '|'))
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

fn stub_portals(fields: &Value) -> Value {
    let functions = list_from(fields.get("functions"));
    let companies = list_from(fields.get("companies"));
    let remote = as_string(fields.get("remote"));
    let location = as_string(fields.get("location"));
    let mut allow = Vec::new();
    if remote != "onsite" {
        allow.push("Remote");
    }
    let city = location.split(',').next().unwrap_or("").trim();
    if !city.is_empty()
        && remote != "remote"
        && city.len() >= 3
        && !matches!(
            city.to_ascii_lowercase().as_str(),
            "us" | "usa" | "united states" | "north america"
        )
    {
        allow.push(city);
    }
    if allow.is_empty() && remote != "onsite" {
        allow.push("Remote");
    }

    let mut portals = json!({
        "title_filter": {
            "positive": functions,
            "negative": ["Intern", "Internship", "Coordinator", "Assistant", "Junior", "Entry Level", "Apprentice", "Freelance"]
        },
        "location_filter": { "allow": allow },
        "job_boards": [
            { "name": "Himalayas", "provider": "himalayas", "enabled": true },
            { "name": "Remotive", "provider": "remotive", "enabled": true },
            { "name": "Jobicy", "provider": "jobicy", "enabled": true }
        ]
    });
    if !companies.is_empty() {
        portals["tracked_companies"] = companies
            .into_iter()
            .map(|name| {
                json!({
                    "name": name,
                    "enabled": false,
                    "notes": "Seeded company — add a careers page to include it in search."
                })
            })
            .collect();
    }
    portals
}

fn stub_proposal(source: &str, input: &Value) -> Value {
    let location = as_string(input.get("location"));
    let remote = {
        let raw = as_string(input.get("remote"));
        if raw.is_empty() { "unspecified".into() } else { raw }
    };
    let seniority = as_string(input.get("seniority"));
    let functions = list_from(input.get("functions"));
    let companies = list_from(input.get("companies"));
    let keywords = if functions.is_empty() {
        "your function keywords".to_string()
    } else {
        functions.join(", ")
    };
    let place = if !location.is_empty()
        && !matches!(
            location.to_ascii_lowercase().as_str(),
            "us" | "usa" | "united states" | "north america"
        ) {
        format!(" near {location}")
    } else {
        String::new()
    };
    let fields = json!({
        "location": location,
        "remote": remote,
        "seniority": if seniority.is_empty() { Value::Null } else { Value::String(seniority) },
        "functions": functions,
        "companies": companies,
    });
    json!({
        "source": source,
        "stub": true,
        "plainLanguageSummary": format!(
            "We'll look for {keywords} ({remote}){place}. Local scanner is not available in this session. Open the desktop app with Node installed to save your search and turn on Career Loop."
        ),
        "fields": fields,
        "draftPortals": stub_portals(&fields),
        "uncertainties": [{
            "field": "runtime",
            "message": "Local scanner is not available in this session. Search settings are a preview.",
            "confidence": "high"
        }]
    })
}

fn stub_turn_on(portals: &Value, detail: String) -> Value {
    json!({
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
            "detail": detail,
            "user_copies_plist": false,
            "catch_up_on_wake": true
        },
        "portals": portals,
    })
}

fn core_or_stub_proposal(command: &str, payload: Value, source: &str, fields: &Value) -> Result<Value, String> {
    match invoke_core(command, &payload) {
        Ok(v) => Ok(v),
        Err(CoreInvokeError::Failed(e)) => Err(e),
        Err(CoreInvokeError::Unavailable(_)) => Ok(stub_proposal(source, fields)),
    }
}

#[tauri::command]
fn propose_from_answers(answers: Value) -> Result<Value, String> {
    core_or_stub_proposal(
        "proposeFromAnswers",
        json!({ "answers": answers }),
        "answers",
        &answers,
    )
}

#[tauri::command]
fn propose_from_resume(resume_text: String) -> Result<Value, String> {
    let payload = json!({ "resumeText": resume_text });
    match invoke_core("proposeFromResume", &payload) {
        Ok(v) => Ok(v),
        Err(CoreInvokeError::Failed(e)) => Err(e),
        Err(CoreInvokeError::Unavailable(_)) => Ok(stub_proposal("resume", &json!({}))),
    }
}

#[tauri::command]
fn confirm_portals(proposal: Value, edits: Option<Value>) -> Result<Value, String> {
    let payload = json!({ "proposal": proposal, "edits": edits.clone().unwrap_or(Value::Bool(true)) });
    match invoke_core("confirmPortals", &payload) {
        Ok(v) => Ok(v),
        Err(CoreInvokeError::Failed(e)) => Err(e),
        Err(CoreInvokeError::Unavailable(_)) => {
            let mut fields = proposal.get("fields").cloned().unwrap_or_else(|| json!({}));
            if let Some(Value::Object(extra)) = edits.as_ref().and_then(|e| e.get("fields")) {
                if let Value::Object(map) = &mut fields {
                    for (k, v) in extra {
                        map.insert(k.clone(), v.clone());
                    }
                }
            }
            Ok(stub_portals(&fields))
        }
    }
}

#[tauri::command]
fn turn_on_career_loop(portals: Value) -> Result<Value, String> {
    match invoke_core("turnOnCareerLoop", &json!({ "portals": portals })) {
        Ok(v) => Ok(v),
        Err(CoreInvokeError::Failed(e)) => Err(e),
        Err(CoreInvokeError::Unavailable(e)) => Ok(stub_turn_on(
            &portals,
            format!("rust-fallback: {e} — install Node and retry"),
        )),
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
        .invoke_handler(tauri::generate_handler![
            propose_from_answers,
            propose_from_resume,
            confirm_portals,
            turn_on_career_loop,
            data_plane_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running Career Loop");
}
