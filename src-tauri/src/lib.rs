// Flick desktop shell.
//
// The UI and its API are served by the bundled Flick server (the Node app in
// server/, compiled to a single binary with Bun). On launch we start that
// server on a free localhost port, show a blank window straight away, and
// point the window at the server as soon as it accepts connections.

use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogResult};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

/// Preferred port. A fixed port keeps the page origin (and so any browser
/// storage) the same between launches. If it is taken we fall back to any
/// free port.
const PREFERRED_PORT: u16 = 47317;

struct Server(Mutex<Option<CommandChild>>);

fn pick_port() -> u16 {
    if TcpListener::bind((Ipv4Addr::LOCALHOST, PREFERRED_PORT)).is_ok() {
        return PREFERRED_PORT;
    }
    TcpListener::bind((Ipv4Addr::LOCALHOST, 0))
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(PREFERRED_PORT)
}

fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let addr = SocketAddrV4::new(Ipv4Addr::LOCALHOST, port).into();
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    false
}

fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn show_error(app: &AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "location.hash = 'error=' + {:?}; location.reload();",
            encode(message)
        ));
    }
}

fn start_server(app: &AppHandle) -> Result<u16, String> {
    let port = pick_port();
    let ui_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("ui");

    let (mut rx, child) = app
        .shell()
        .sidecar("flick-server")
        .map_err(|e| e.to_string())?
        .env("FLICK_DESKTOP", "1")
        .env("FLICK_PORT", port.to_string())
        .env("FLICK_UI_DIR", ui_dir.to_string_lossy().to_string())
        .spawn()
        .map_err(|e| e.to_string())?;
    app.state::<Server>().0.lock().unwrap().replace(child);

    // Forward server output to the app's stdout/stderr for debugging.
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => print!("{}", String::from_utf8_lossy(&line)),
                CommandEvent::Stderr(line) => eprint!("{}", String::from_utf8_lossy(&line)),
                _ => {}
            }
        }
    });
    Ok(port)
}

/// How often a running app checks for a new version, besides at launch.
const UPDATE_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);

/// Builds made without the updater key (local builds, and CI builds before
/// the key was added) can't verify an update, so they shouldn't offer one.
fn updates_enabled(app: &AppHandle) -> bool {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("pubkey"))
        .and_then(|k| k.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

/// macOS runs a quarantined app from a read-only copy ("App Translocation"),
/// which the updater can't replace.
fn is_translocated() -> bool {
    std::env::current_exe()
        .map(|p| p.to_string_lossy().contains("/AppTranslocation/"))
        .unwrap_or(false)
}

fn alert(app: &AppHandle, title: &str, message: String) {
    app.dialog().message(message).title(title).show(|_| {});
}

async fn ask(app: &AppHandle, title: &str, message: String, ok: &str, cancel: &str) -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let ok_label = ok.to_string();
    app.dialog()
        .message(message)
        .title(title)
        .buttons(MessageDialogButtons::OkCancelCustom(ok.into(), cancel.into()))
        .show_with_result(move |result| {
            let yes = match result {
                MessageDialogResult::Ok | MessageDialogResult::Yes => true,
                MessageDialogResult::Custom(label) => label == ok_label,
                _ => false,
            };
            let _ = tx.send(yes);
        });
    rx.await.unwrap_or(false)
}

fn set_title(app: &AppHandle, title: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(title);
    }
}

/// Checks GitHub Releases for a newer signed build. If there is one, asks
/// whether to install it now; on yes it downloads, installs and restarts.
/// A failed check (offline, say) is only logged; a failed install is shown.
async fn check_for_update(app: AppHandle) -> Result<(), String> {
    if !updates_enabled(&app) {
        return Ok(());
    }
    let Some(update) = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };

    let message = format!(
        "Flick {} is available (you have {}). Update now? Flick will restart.",
        update.version, update.current_version
    );
    if !ask(&app, "Update available", message, "Update", "Later").await {
        return Ok(());
    }

    if is_translocated() {
        alert(
            &app,
            "Can't update yet",
            "macOS is running Flick from a temporary read-only copy, so it can't replace itself. \
             Quit Flick, run this once in Terminal, then open Flick again:\n\n\
             xattr -dr com.apple.quarantine /Applications/Flick.app"
                .into(),
        );
        return Ok(());
    }

    let mut downloaded: usize = 0;
    let progress_app = app.clone();
    let result = update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk;
                if let Some(total) = total.filter(|t| *t > 0) {
                    let pct = (downloaded as u64 * 100 / total).min(100);
                    set_title(&progress_app, &format!("Flick: downloading update {pct}%"));
                }
            },
            || {},
        )
        .await;
    if let Err(e) = result {
        set_title(&app, "Flick");
        alert(&app, "Update failed", format!("Flick couldn't install the update: {e}"));
        return Ok(());
    }

    set_title(&app, "Flick: restarting");
    if let Some(child) = app.state::<Server>().0.lock().unwrap().take() {
        let _ = child.kill();
    }
    app.restart();
}

fn start_update_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            if let Err(e) = check_for_update(app.clone()).await {
                eprintln!("Update check failed: {e}");
            }
            tokio::time::sleep(UPDATE_CHECK_INTERVAL).await;
        }
    });
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(Server(Mutex::new(None)))
        .setup(|app| {
            let handle = app.handle().clone();
            let downloads = app.path().download_dir().ok();

            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Flick")
                .inner_size(1200.0, 820.0)
                .min_inner_size(720.0, 560.0)
                .background_color(tauri::window::Color(14, 15, 17, 255))
                // Settings > Export uses a download link; save it to ~/Downloads.
                .on_download(move |_webview, event| {
                    if let tauri::webview::DownloadEvent::Requested { url, destination } = event {
                        if let Some(dir) = &downloads {
                            let name = destination
                                .file_name()
                                .map(|n| n.to_owned())
                                .or_else(|| url.path_segments().and_then(|s| s.last()).map(Into::into))
                                .unwrap_or_else(|| "flick-download".into());
                            *destination = dir.join(name);
                        }
                    }
                    true
                })
                .build()?;

            match start_server(&handle) {
                Ok(port) => {
                    std::thread::spawn(move || {
                        if wait_for_port(port, Duration::from_secs(20)) {
                            let url: Url = format!("http://127.0.0.1:{port}/").parse().unwrap();
                            if let Some(window) = handle.get_webview_window("main") {
                                let _ = window.navigate(url);
                            }
                        } else {
                            show_error(&handle, "it did not respond in time.");
                        }
                    });
                }
                Err(e) => show_error(&handle, &e),
            }
            start_update_checks(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Flick")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(child) = app.state::<Server>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
