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
    pub dispositivos_cache: Mutex<crate::commands::dispositivos::DispositivosCache>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
            fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
            fs::create_dir_all(data_dir.join("respaldos")).map_err(|e| e.to_string())?;
            fs::create_dir_all(data_dir.join("tickets")).map_err(|e| e.to_string())?;
            let db_path = data_dir.join("allco.db");

            // Migra la base de datos de versiones anteriores, incluidos sus WAL/SHM.
            if !db_path.exists() {
                if let Ok(entries) = fs::read_dir(&data_dir) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("db") {
                            let stem = path
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("db")
                                .to_string();
                            if fs::rename(&path, &db_path).is_ok() {
                                for suffix in ["-wal", "-shm", "-journal"] {
                                    let old_side = data_dir.join(format!("{stem}.db{suffix}"));
                                    if old_side.exists() {
                                        let _ = fs::rename(
                                            old_side,
                                            data_dir.join(format!("allco.db{suffix}")),
                                        );
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }

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
                dispositivos_cache: Mutex::new(Default::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            sesion_actual,
            usuarios_login,
            registrar_escaneo,
            listar_dispositivos,
            actualizar_dispositivos,
            guardar_impresora_ticket,
            imprimir_prueba,
            imprimir_factura,
            listar_proveedores,
            listar_sucursales,
            listar_productos,
            buscar_producto_codigo,
            guardar_producto,
            archivar_producto,
            restaurar_producto,
            eliminar_producto,
            movimiento_inventario,
            kardex,
            listar_servicios,
            guardar_servicio,
            listar_clientes,
            guardar_cliente,
            facturas_cliente,
            estado_pruebas,
            agregar_datos_ejemplo,
            crear_venta,
            anular_venta,
            listar_ventas,
            obtener_ticket,
            dashboard,
            reporte_ventas,
            resumen_ventas,
            productos_stock_minimo,
            listar_usuarios,
            guardar_usuario,
            obtener_config,
            guardar_config,
            marca_negocio,
            bitacora,
            status_sistema,
            respaldo_local,
            eliminar_datos,
            abrir_carpeta_datos,
            abrir_carpeta_respaldos,
        ])
        .build(tauri::generate_context!())
        .expect("error al iniciar AllCo")
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
