use crate::autostart;
use crate::commands::auth::{require_accion, require_dev, require_roles, require_user};
use crate::db;
use crate::models::{
    AlertaSistema, ConfigApp, EventoSistema, Licencia, LoginHoy, MarcaNegocio, StatusSistema,
    UsuarioIn, UsuarioPublico,
};
use crate::AppState;
use rusqlite::params;
use std::fs;
use std::net::TcpStream;
use std::time::Duration;
use sysinfo::Disks;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn listar_usuarios(state: State<AppState>) -> Result<Vec<UsuarioPublico>, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre, usuario, rol, activo, es_dev FROM usuarios ORDER BY nombre")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], db::usuario_from_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn guardar_usuario(state: State<AppState>, data: UsuarioIn) -> Result<i64, String> {
    let admin = require_roles(&state, &["admin"])?;
    require_accion(
        &state,
        "/config",
        if data.id.is_some() { "editar" } else { "crear" },
    )?;
    if data.nombre.trim().is_empty() || data.usuario.trim().is_empty() {
        return Err("Nombre y usuario son obligatorios.".into());
    }
    if !matches!(data.rol.as_str(), "admin" | "bodega" | "caja") {
        return Err("Rol inválido.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    if let Some(id) = data.id {
        let target_dev: i64 = conn
            .query_row(
                "SELECT es_dev FROM usuarios WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if target_dev != 0 && !admin.dev {
            return Err("No puede modificar al usuario de desarrollo.".into());
        }
        if id == admin.id && !data.activo {
            return Err("No puede desactivarse a sí mismo.".into());
        }
        if id == admin.id && data.rol != "admin" {
            return Err("No puede quitarse el rol de administrador.".into());
        }
        if data.rol != "admin" {
            let admins: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1 AND id != ?1",
                    params![id],
                    |r| r.get(0),
                )
                .map_err(|e| e.to_string())?;
            let current_rol: String = conn
                .query_row("SELECT rol FROM usuarios WHERE id = ?1", params![id], |r| {
                    r.get(0)
                })
                .map_err(|_| "Usuario no encontrado.".to_string())?;
            if current_rol == "admin" && admins == 0 {
                return Err("Debe quedar al menos un administrador activo.".into());
            }
        }
        conn.execute(
            "UPDATE usuarios SET nombre=?1, usuario=?2, rol=?3, activo=?4 WHERE id=?5",
            params![
                data.nombre.trim(),
                data.usuario.trim(),
                data.rol,
                if data.activo { 1 } else { 0 },
                id
            ],
        )
        .map_err(|e| map_user_err(e))?;
        if let Some(pw) = data.password {
            if !pw.is_empty() {
                if pw.len() < 6 {
                    return Err("La contraseña debe tener al menos 6 caracteres.".into());
                }
                let hash = bcrypt::hash(&pw, db::BCRYPT_COST).map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE usuarios SET password_hash = ?1, intentos_fallidos = 0, bloqueado_hasta = NULL
                     WHERE id = ?2",
                    params![hash, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        Ok(id)
    } else {
        let pw = data.password.unwrap_or_default();
        if pw.len() < 6 {
            return Err("La contraseña debe tener al menos 6 caracteres.".into());
        }
        let hash = bcrypt::hash(&pw, db::BCRYPT_COST).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, created_at)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                data.nombre.trim(),
                data.usuario.trim(),
                hash,
                data.rol,
                if data.activo { 1 } else { 0 },
                db::now()
            ],
        )
        .map_err(|e| map_user_err(e))?;
        Ok(conn.last_insert_rowid())
    }
}

fn map_user_err(e: rusqlite::Error) -> String {
    let s = e.to_string();
    if s.contains("UNIQUE") {
        "Ese nombre de usuario ya existe.".into()
    } else {
        s
    }
}

#[tauri::command]
pub fn obtener_config(state: State<AppState>) -> Result<ConfigApp, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::config_map(&conn)
}

#[tauri::command]
pub fn guardar_config(state: State<AppState>, data: ConfigApp) -> Result<(), String> {
    require_roles(&state, &["admin"])?;
    require_accion(&state, "/config", "editar")?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::save_config(&conn, &data)
}

#[tauri::command]
pub fn obtener_inicio_automatico(app: AppHandle, state: State<AppState>) -> Result<bool, String> {
    require_roles(&state, &["admin"])?;
    Ok(autostart::activo(&app).unwrap_or(false))
}

#[tauri::command]
pub fn guardar_inicio_automatico(
    app: AppHandle,
    state: State<AppState>,
    activo: bool,
) -> Result<(), String> {
    require_roles(&state, &["admin"])?;
    require_accion(&state, "/config", "editar")?;
    if !autostart::disponible() {
        return Err(
            "El inicio automático se activa en la app instalada; la versión de desarrollo no puede arrancar sola."
                .into(),
        );
    }
    autostart::sincronizar(&app, activo)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('iniciar_al_encender', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![if activo { "1" } else { "0" }],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn obtener_licencia(state: State<AppState>) -> Result<Licencia, String> {
    require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::licencia(&conn)
}

#[tauri::command]
pub fn guardar_licencia(state: State<AppState>, data: Licencia) -> Result<(), String> {
    let user = require_dev(&state)?;
    if data.expira.trim().is_empty() {
        return Err("Indique la fecha de expiración de la licencia.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::save_licencia(&conn, &data)?;
    let _ = db::log_event(
        &conn,
        "licencia",
        Some(user.id),
        &format!("Licencia actualizada. Vence: {}", data.expira),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn guardar_reporte_fiscal(
    state: State<AppState>,
    ruta: String,
    contenido: String,
) -> Result<(), String> {
    require_roles(&state, &["admin"])?;
    require_accion(&state, "/config", "crear")?;
    let destino = std::path::PathBuf::from(ruta);
    let es_csv = destino
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("csv"))
        .unwrap_or(false);
    if !es_csv {
        return Err("El reporte debe guardarse como archivo CSV.".into());
    }
    std::fs::write(&destino, contenido).map_err(|e| e.to_string())
}

/// Marca visible para todos los roles: nombre y logo del negocio.
#[tauri::command]
pub fn marca_negocio(state: State<AppState>) -> Result<MarcaNegocio, String> {
    require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::marca_negocio(&conn)
}

#[tauri::command]
pub fn bitacora(
    state: State<AppState>,
    tipo: Option<String>,
) -> Result<Vec<EventoSistema>, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let filtro = tipo.unwrap_or_default();
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.tipo, u.nombre, e.mensaje, e.fecha
             FROM eventos_sistema e
             LEFT JOIN usuarios u ON u.id = e.usuario_id
             WHERE (?1 = '' OR e.tipo LIKE ?1)
             ORDER BY e.id DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let like = if filtro.is_empty() {
        String::new()
    } else {
        format!("%{filtro}%")
    };
    let rows = stmt
        .query_map(params![like], evento_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn evento_row(r: &rusqlite::Row) -> rusqlite::Result<EventoSistema> {
    Ok(EventoSistema {
        id: r.get(0)?,
        tipo: r.get(1)?,
        usuario_nombre: r.get(2)?,
        mensaje: r.get(3)?,
        fecha: r.get(4)?,
    })
}

#[tauri::command]
pub fn status_sistema(app: AppHandle, state: State<AppState>) -> Result<StatusSistema, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let cfg = db::config_map(&conn)?;
    let version = app.package_info().version.to_string();
    let db_bytes = fs::metadata(&state.db_path).map(|m| m.len()).unwrap_or(0);
    let (disco_libre_bytes, disco_total_bytes) = disk_space(&state.db_path);

    let ultimo_local: Option<(String, i64, Option<String>)> = conn
        .query_row(
            "SELECT fecha, exito, mensaje_error FROM respaldos
             WHERE tipo = 'local' ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional_ok();
    let ultimo_remoto: Option<(String, i64, Option<String>)> = conn
        .query_row(
            "SELECT fecha, exito, mensaje_error FROM respaldos
             WHERE tipo = 'remoto' ORDER BY id DESC LIMIT 1",
            [],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional_ok();

    let umbral_dias: i64 = cfg.umbral_respaldo_dias.parse().unwrap_or(7);
    let umbral_db_mb: u64 = cfg.umbral_db_mb.parse().unwrap_or(500);
    let mut error_respaldo = None;
    let estado_respaldo = match &ultimo_local {
        None => "atrasado".to_string(),
        Some((fecha, exito, err)) => {
            if *exito == 0 {
                error_respaldo = err.clone();
                "fallido".into()
            } else if backup_stale(fecha, umbral_dias) {
                "atrasado".into()
            } else {
                "al_dia".into()
            }
        }
    };

    let print_last = db::last_evento(&conn, "print_%")?;
    let (impresora, ultimo_error_impresion) = match print_last {
        Some((tipo, msg, _)) if tipo == "print_fail" => {
            ("error".into(), Some(msg))
        }
        Some(_) => ("lista".into(), None),
        None => ("sin_uso".into(), None),
    };

    let last_scan = state
        .last_scan
        .lock()
        .ok()
        .and_then(|g| g.clone());
    let sesion_inicio = state.sesion_inicio.lock().ok().and_then(|g| g.clone());

    let mut stmt = conn
        .prepare(
            "SELECT u.nombre, u.usuario, u.rol, s.inicio FROM sesiones s
             JOIN usuarios u ON u.id = s.usuario_id
             WHERE s.exito = 1 AND date(s.inicio) = date('now','localtime')
             ORDER BY s.id DESC LIMIT 20",
        )
        .map_err(|e| e.to_string())?;
    let logins_hoy = stmt
        .query_map([], |r| {
            Ok(LoginHoy {
                nombre: r.get(0)?,
                usuario: r.get(1)?,
                rol: r.get(2)?,
                inicio: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.tipo, u.nombre, e.mensaje, e.fecha
             FROM eventos_sistema e LEFT JOIN usuarios u ON u.id = e.usuario_id
             WHERE e.tipo IN ('login_ok','login_fail')
             ORDER BY e.id DESC LIMIT 10",
        )
        .map_err(|e| e.to_string())?;
    let ultimos_logins = stmt
        .query_map([], evento_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.tipo, u.nombre, e.mensaje, e.fecha
             FROM eventos_sistema e LEFT JOIN usuarios u ON u.id = e.usuario_id
             WHERE e.tipo LIKE '%_fail'
             ORDER BY e.id DESC LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let errores_recientes = stmt
        .query_map([], evento_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.tipo, u.nombre, e.mensaje, e.fecha
             FROM eventos_sistema e LEFT JOIN usuarios u ON u.id = e.usuario_id
             ORDER BY e.id DESC LIMIT 30",
        )
        .map_err(|e| e.to_string())?;
    let bitacora = stmt
        .query_map([], evento_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let ventas_hoy = db::count_query(
        &conn,
        "SELECT COUNT(*) FROM ventas WHERE estado='completada' AND date(fecha)=date('now','localtime')",
    )?;
    let items_hoy = db::count_query(
        &conn,
        "SELECT COALESCE(SUM(i.cantidad),0) FROM venta_items i
         JOIN ventas v ON v.id = i.venta_id
         WHERE v.estado='completada' AND date(v.fecha)=date('now','localtime')",
    )?;
    let movimientos_hoy = db::count_query(
        &conn,
        "SELECT COUNT(*) FROM movimientos_inv WHERE date(fecha)=date('now','localtime')",
    )?;
    let tickets_hoy = db::count_query(
        &conn,
        "SELECT COUNT(*) FROM eventos_sistema WHERE tipo='print_ok' AND date(fecha)=date('now','localtime')",
    )?;
    let total_productos = db::count_query(&conn, "SELECT COUNT(*) FROM productos WHERE activo=1")?;
    let total_servicios = db::count_query(&conn, "SELECT COUNT(*) FROM servicios WHERE activo=1")?;
    let total_usuarios = db::count_query(&conn, "SELECT COUNT(*) FROM usuarios WHERE activo=1")?;
    let ventas_mes = db::count_query(
        &conn,
        "SELECT COUNT(*) FROM ventas WHERE estado='completada'
         AND strftime('%Y-%m', fecha)=strftime('%Y-%m','now','localtime')",
    )?;

    let addr: std::net::SocketAddr = "1.1.1.1:443".parse().unwrap();
    let online = TcpStream::connect_timeout(&addr, Duration::from_millis(800)).is_ok();

    let mut alertas = Vec::new();
    if disco_libre_bytes > 0 && disco_libre_bytes < 2 * 1024 * 1024 * 1024 {
        alertas.push(AlertaSistema {
            nivel: "warning".into(),
            mensaje: "Queda menos de 2 GB libres en el disco.".into(),
        });
    }
    if db_bytes > umbral_db_mb * 1024 * 1024 {
        alertas.push(AlertaSistema {
            nivel: "warning".into(),
            mensaje: format!("La base de datos supera {umbral_db_mb} MB. Conviene respaldar."),
        });
    }
    if estado_respaldo != "al_dia" {
        alertas.push(AlertaSistema {
            nivel: if estado_respaldo == "fallido" {
                "danger".into()
            } else {
                "warning".into()
            },
            mensaje: format!("Respaldo {estado_respaldo}. Umbral: cada {umbral_dias} días."),
        });
    }
    if impresora == "error" {
        alertas.push(AlertaSistema {
            nivel: "danger".into(),
            mensaje: "El último intento de impresión falló.".into(),
        });
    }

    Ok(StatusSistema {
        version,
        db_bytes,
        disco_libre_bytes,
        disco_total_bytes,
        ultimo_respaldo_local: ultimo_local.map(|x| x.0),
        ultimo_respaldo_remoto: ultimo_remoto.map(|x| x.0),
        estado_respaldo,
        error_respaldo,
        started_at: state.started_at.clone(),
        sesion_inicio,
        online,
        impresora,
        ultimo_error_impresion,
        ultimo_escaneo: last_scan,
        logins_hoy,
        ultimos_logins,
        ventas_hoy,
        items_hoy,
        movimientos_hoy,
        tickets_hoy,
        total_productos,
        total_servicios,
        total_usuarios,
        ventas_mes,
        errores_recientes,
        alertas,
        bitacora,
    })
}

trait OptionalOk<T> {
    fn optional_ok(self) -> Option<T>;
}
impl<T> OptionalOk<T> for Result<T, rusqlite::Error> {
    fn optional_ok(self) -> Option<T> {
        self.ok()
    }
}

fn copia_seguridad(
    conn: &rusqlite::Connection,
    dest: &std::path::Path,
) -> Result<(), String> {
    if dest.exists() {
        return Err("Ya existe un archivo con ese nombre.".into());
    }
    conn.execute(
        "VACUUM INTO ?1",
        params![dest.to_string_lossy().to_string()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn backup_stale(fecha: &str, dias: i64) -> bool {
    let parsed = chrono::NaiveDateTime::parse_from_str(fecha, "%Y-%m-%d %H:%M:%S");
    let Ok(dt) = parsed else {
        return true;
    };
    let now = chrono::Local::now().naive_local();
    (now - dt).num_days() > dias
}

fn disk_space(path: &std::path::Path) -> (u64, u64) {
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.list() {
        if path.starts_with(disk.mount_point()) {
            return (disk.available_space(), disk.total_space());
        }
    }
    (0, 0)
}

#[tauri::command]
pub fn respaldo_local(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    let user = require_roles(&state, &["admin"])?;
    require_accion(&state, "/base-datos", "crear")?;
    let dest_dir = app
        .dialog()
        .file()
        .set_title("Carpeta para el respaldo")
        .blocking_pick_folder();

    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let filename = format!("allco-{stamp}.db");
    let default_dir = state.data_dir.join("respaldos");
    fs::create_dir_all(&default_dir).map_err(|e| e.to_string())?;
    let default_path = default_dir.join(&filename);
    {
        let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
        copia_seguridad(&conn, &default_path)?;
    }
    let size = fs::metadata(&default_path).map(|m| m.len()).unwrap_or(0);

    let mut final_path = default_path.clone();
    if let Some(folder) = dest_dir {
        let extra = folder.into_path().map_err(|e| e.to_string())?;
        let extra_file = extra.join(&filename);
        if let Err(e) = fs::copy(&default_path, &extra_file) {
            let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
            conn.execute(
                "INSERT INTO respaldos (tipo, ruta_o_key, tamano_bytes, exito, mensaje_error, fecha)
                 VALUES ('local', ?1, ?2, 0, ?3, ?4)",
                params![default_path.to_string_lossy(), size as i64, e.to_string(), db::now()],
            )
            .map_err(|e| e.to_string())?;
            db::log_event(
                &conn,
                "backup_fail",
                Some(user.id),
                &e.to_string(),
                None,
            )?;
            return Err(format!("Se guardó en la carpeta local, pero falló la copia extra: {e}"));
        }
        final_path = extra_file;
    }

    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    conn.execute(
        "INSERT INTO respaldos (tipo, ruta_o_key, tamano_bytes, exito, mensaje_error, fecha)
         VALUES ('local', ?1, ?2, 1, NULL, ?3)",
        params![final_path.to_string_lossy(), size as i64, db::now()],
    )
    .map_err(|e| e.to_string())?;
    db::log_event(
        &conn,
        "backup_ok",
        Some(user.id),
        &format!("Respaldo local: {}", final_path.display()),
        None,
    )?;
    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn eliminar_datos(state: State<AppState>) -> Result<String, String> {
    let user = require_roles(&state, &["admin"])?;
    require_accion(&state, "/base-datos", "eliminar")?;
    let mut conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let dir = state.data_dir.join("respaldos");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup = dir.join(format!("auto-{stamp}.db"));
    copia_seguridad(&conn, &backup)?;
    let size = fs::metadata(&backup).map(|m| m.len()).unwrap_or(0);
    conn.execute(
        "INSERT INTO respaldos (tipo, ruta_o_key, tamano_bytes, exito, mensaje_error, fecha)
         VALUES ('local', ?1, ?2, 1, NULL, ?3)",
        params![backup.to_string_lossy(), size as i64, db::now()],
    )
    .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM venta_items", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM movimientos_inv", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM gastos", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM ventas", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM productos", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM servicios", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM clientes", [])
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    if let Ok(entries) = fs::read_dir(state.data_dir.join("tickets")) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    db::log_event(
        &conn,
        "datos_eliminados",
        Some(user.id),
        &format!(
            "Datos operativos eliminados. Respaldo: {}",
            backup.display()
        ),
        None,
    )?;

    Ok(backup.to_string_lossy().to_string())
}

#[tauri::command]
pub fn abrir_carpeta_datos(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    require_roles(&state, &["admin"])?;
    app.opener()
        .open_path(state.data_dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn abrir_carpeta_respaldos(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    require_roles(&state, &["admin"])?;
    let dir = state.data_dir.join("respaldos");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    app.opener()
        .open_path(dir.to_string_lossy().to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}
