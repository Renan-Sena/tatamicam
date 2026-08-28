#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Sha256, Digest};
use sysinfo::Networks;
use tauri_plugin_fs::FsExt;

mod license;

#[tauri::command]
fn get_hwid() -> String {
    // Âncora estável e única por máquina. No Linux (alvo: Zorin) o machine-id/product_uuid
    // é persistente; é o que garante um HWID consistente entre reinícios.
    let machine_id = std::fs::read_to_string("/etc/machine-id")
        .or_else(|_| std::fs::read_to_string("/var/lib/dbus/machine-id"))
        .or_else(|_| std::fs::read_to_string("/sys/class/dmi/id/product_uuid"))
        .unwrap_or_default()
        .trim()
        .to_string();

    // MAC como reforço, mas DETERMINÍSTICO: a iteração de HashMap é aleatória, então
    // nunca usar .next() direto (era o bug que trocava o HWID a cada execução e fazia o
    // app pedir o token toda hora). Ordena e ignora MACs vazios/zerados.
    let mut macs: Vec<String> = Networks::new_with_refreshed_list()
        .iter()
        .map(|(_, net)| net.mac_address().to_string())
        .filter(|m| !m.is_empty() && m != "00:00:00:00:00:00")
        .collect();
    macs.sort();
    let mac = macs.into_iter().next().unwrap_or_default();

    let hostname = sysinfo::System::host_name().unwrap_or_default();

    let raw = format!("{}:{}:{}", machine_id, mac, hostname);
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect::<String>()
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_hwid,
            license::verify_license_jwt,
        ])
        .setup(|app| {
            let scope = app.fs_scope();
            scope.allow_directory("$DOCUMENT", true).unwrap();
            scope.allow_directory("$DOWNLOAD", true).unwrap();
            scope.allow_directory("$DESKTOP", true).unwrap();

            // Linux (WebKitGTK): habilita o MediaStream e CONCEDE a permissão de câmera.
            // Sem isto, o getUserMedia é negado ("Permission denied") no Tauri/Linux.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.with_webview(|webview| {
                        use webkit2gtk::{PermissionRequestExt, SettingsExt, WebViewExt};
                        let wv = webview.inner();
                        if let Some(settings) = WebViewExt::settings(&wv) {
                            settings.set_enable_media_stream(true);
                            settings.set_enable_media_capabilities(true);
                        }
                        // Concede automaticamente os pedidos de permissão (câmera/mic).
                        wv.connect_permission_request(|_wv, req| {
                            req.allow();
                            true
                        });
                    });
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}