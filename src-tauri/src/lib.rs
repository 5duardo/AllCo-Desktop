mod commands;
mod db;
mod models;

use commands::*;
use models::UsuarioPublico;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, RunEvent};

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub session: Mutex<Option<UsuarioPublico>>,
    pub session_id: Mutex<Option<i64>>,
    pub sesion_inicio: Mutex<Option<String>>,
    pub started_at: String,
    pub last_scan: Mutex<Option<String>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(data_dir.join("respaldos")).map_err(|e| e.to_string())?;
            fs::create_dir_all(data_dir.join("tickets")).map_err(|e| e.to_string())?;
            let db_path = data_dir.join("sic.db");
            let conn = db::open(&db_path)?;
            db::migrate_and_seed(&conn)?;
            db::log_event(&conn, "app_start", None, "Aplicación iniciada", None)?;
            app.manage(AppState {
                db: Mutex::new(conn),
                db_path,
                data_dir,
                session: Mutex::new(None),
                session_id: Mutex::new(None),
                sesion_inicio: Mutex::new(None),
                started_at: db::now(),
                last_scan: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            sesion_actual,
            usuarios_login,
            registrar_escaneo,
            listar_proveedores,
            listar_sucursales,
            listar_productos,
            buscar_producto_codigo,
            guardar_producto,
            movimiento_inventario,
            kardex,
            listar_servicios,
            guardar_servicio,
            crear_venta,
            anular_venta,
            listar_ventas,
            obtener_ticket,
            dashboard,
            reporte_ventas,
            productos_stock_minimo,
            listar_usuarios,
            guardar_usuario,
            obtener_config,
            guardar_config,
            bitacora,
            status_sistema,
            respaldo_local,
            abrir_carpeta_datos,
            abrir_carpeta_respaldos,
        ])
        .build(tauri::generate_context!())
        .expect("error al iniciar SIC")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(conn) = state.db.lock() {
                        let uid = state.session.lock().ok().and_then(|s| s.as_ref().map(|u| u.id));
                        let _ = db::log_event(&conn, "app_exit", uid, "Aplicación cerrada", None);
                    }
                }
            }
        });
}
