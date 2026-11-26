mod autostart;
mod commands;
mod db;
mod models;

use commands::*;
use models::UsuarioPublico;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, RunEvent, WebviewWindow};

/// Muestra una ventana y la trae al frente aunque Windows haya arrancado la app
/// en segundo plano (por ejemplo, desde el inicio automático).
fn mostrar_al_frente<R: tauri::Runtime>(ventana: &WebviewWindow<R>) {
    let _ = ventana.unminimize();
    let _ = ventana.show();
    // Alternar "siempre visible" fuerza a Windows a subirla por encima del resto.
    let _ = ventana.set_always_on_top(true);
    let _ = ventana.set_focus();
    let _ = ventana.set_always_on_top(false);
}

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub session: Mutex<Option<UsuarioPublico>>,
    pub session_id: Mutex<Option<i64>>,
    pub sesion_inicio: Mutex<Option<String>>,
    pub started_at: String,
    pub last_scan: Mutex<Option<String>>,
    pub version_disponible: Mutex<Option<String>>,
    pub dispositivos_cache: Mutex<crate::commands::dispositivos::DispositivosCache>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("AllCo")
                .build(),
        )
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
            // El inicio con Windows viene activado por defecto y respeta la preferencia guardada.
            let inicio_automatico = db::config_flag(&conn, "iniciar_al_encender", true);
            if let Err(e) = autostart::sincronizar(app.handle(), inicio_automatico) {
                eprintln!("No se pudo configurar el inicio automático: {e}");
            }

            // Respaldo: si la interfaz no alcanza a mostrar la ventana principal
            // (una carga fallida, por ejemplo), mostrarla igualmente para que la
            // app nunca quede invisible ni fuera de la barra de tareas.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(8));
                if let Some(main) = handle.get_webview_window("main") {
                    if !main.is_visible().unwrap_or(true) {
                        mostrar_al_frente(&main);
                    }
                }
                if let Some(splash) = handle.get_webview_window("splash") {
                    let _ = splash.close();
                }
            });

            app.manage(AppState {
                db: Mutex::new(conn),
                db_path,
                data_dir,
                session: Mutex::new(None),
                session_id: Mutex::new(None),
                sesion_inicio: Mutex::new(None),
                started_at: db::now(),
                last_scan: Mutex::new(None),
                version_disponible: Mutex::new(None),
                dispositivos_cache: Mutex::new(Default::default()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            login,
            logout,
            sesion_actual,
            usuarios_login,
            mis_permisos,
            obtener_permisos,
            guardar_permisos,
            restablecer_password,
            estado_login,
            registrar_escaneo,
            listar_dispositivos,
            actualizar_dispositivos,
            listar_favoritos_dispositivo,
            alternar_favorito_dispositivo,
            guardar_impresora_ticket,
            imprimir_prueba,
            imprimir_factura,
            listar_proveedores,
            listar_proveedores_detalle,
            guardar_proveedor,
            listar_sucursales,
            listar_empleados,
            guardar_empleado,
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
            listar_gastos,
            guardar_gasto,
            eliminar_gasto,
            resumen_finanzas,
            listar_usuarios,
            guardar_usuario,
            obtener_config,
            guardar_config,
            obtener_inicio_automatico,
            guardar_inicio_automatico,
            marca_negocio,
            obtener_licencia,
            guardar_licencia,
            guardar_reporte_fiscal,
            guardar_version_disponible,
            version_disponible,
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
