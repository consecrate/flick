// Flick desktop shell.
//
// The UI and its API are served by the bundled Flick server (the Node app in
// server/, compiled to a single binary with Bun). On launch we start that
// server on a free localhost port, show a blank window straight away, and
// point the window at the server as soon as it accepts connections.

use std::net::{Ipv4Addr, SocketAddrV4, TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

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

fn show_error(app: &tauri::AppHandle, message: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&format!(
            "location.hash = 'error=' + {:?}; location.reload();",
            encode(message)
        ));
    }
}

fn start_server(app: &tauri::AppHandle) -> Result<u16, String> {
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
