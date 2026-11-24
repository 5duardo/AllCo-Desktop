use crate::db;
use crate::models::UsuarioPublico;
use crate::AppState;
use chrono::{Duration, Local, NaiveDateTime};
use rusqlite::{params, OptionalExtension};
use tauri::State;

fn espera_por_intentos(intentos: i64) -> i64 {
    match intentos {
        0..=2 => 0,
        3 => 30,
        4 => 120,
        5 => 300,
        6 => 900,
        _ => 1800,
    }
}

fn segundos_bloqueo(bloqueado_hasta: &str) -> i64 {
    NaiveDateTime::parse_from_str(bloqueado_hasta, "%Y-%m-%d %H:%M:%S")
        .map(|hasta| (hasta - Local::now().naive_local()).num_seconds())
        .unwrap_or(0)
        .max(0)
}

pub fn require_user(state: &AppState) -> Result<UsuarioPublico, String> {
    state
        .session
        .lock()
        .map_err(|_| "Error interno de sesión".to_string())?
        .clone()
        .ok_or_else(|| "Inicie sesión para continuar.".into())
}

pub fn require_roles(state: &AppState, roles: &[&str]) -> Result<UsuarioPublico, String> {
    let user = require_user(state)?;
    if !roles.contains(&user.rol.as_str()) {
        return Err("No tiene permiso para esta acción.".into());
    }
    Ok(user)
}

/// Valida una acción (crear/editar/eliminar) dentro de un módulo.
/// Si el usuario no tiene permisos personalizados, basta el rol (require_roles).
pub fn require_accion(state: &AppState, modulo: &str, accion: &str) -> Result<(), String> {
    let user = require_user(state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let permisos = db::permisos_usuario(&conn, user.id)?;
    if let Some(keys) = permisos {
        let clave = format!("{modulo}:{accion}");
        if !keys.iter().any(|k| k == modulo) && !keys.contains(&clave) {
            return Err("No tiene permiso para esta acción.".into());
        }
    }
    Ok(())
}

pub fn require_dev(state: &AppState) -> Result<UsuarioPublico, String> {
    let user = require_user(state)?;
    if !user.dev {
        return Err("Solo el usuario de desarrollo puede usar esta función.".into());
    }
    Ok(user)
}

/// Contraseña maestra de soporte AllCo para restablecer accesos locales.
/// Hardcodeada a propósito: solo el equipo de soporte la conoce.
const CLAVE_MAESTRA_SOPORTE: &str = "Allco#Soporte2026";

#[tauri::command]
pub fn restablecer_password(
    state: State<AppState>,
    usuario: String,
    clave_maestra: String,
    nueva_password: String,
) -> Result<(), String> {
    if clave_maestra != CLAVE_MAESTRA_SOPORTE {
        return Err("Contraseña maestra incorrecta.".into());
    }
    let nueva = nueva_password.trim();
    if nueva.len() < 6 {
        return Err("La nueva contraseña debe tener al menos 6 caracteres.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let id: Option<i64> = conn
        .query_row(
            "SELECT id FROM usuarios WHERE lower(usuario) = lower(?1)",
            params![usuario.trim()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some(id) = id else {
        return Err("Usuario no encontrado.".into());
    };
    let hash = bcrypt::hash(nueva, db::BCRYPT_COST).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE usuarios SET password_hash = ?1, intentos_fallidos = 0, bloqueado_hasta = NULL
         WHERE id = ?2",
        params![hash, id],
    )
    .map_err(|e| e.to_string())?;
    let _ = db::log_event(
        &conn,
        "password_reset",
        Some(id),
        "Contraseña restablecida con clave maestra de soporte",
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn estado_login(state: State<AppState>, usuario: String) -> Result<i64, String> {
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let row: Option<Option<String>> = conn
        .query_row(
            "SELECT bloqueado_hasta FROM usuarios WHERE lower(usuario) = lower(?1)",
            params![usuario.trim()],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(row
        .flatten()
        .as_deref()
        .map(segundos_bloqueo)
        .unwrap_or(0))
}

#[tauri::command]
pub fn login(
    state: State<AppState>,
    usuario: String,
    password: String,
) -> Result<UsuarioPublico, String> {
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let row = conn
        .query_row(
            "SELECT id, nombre, usuario, password_hash, rol, activo, es_dev,
                    intentos_fallidos, bloqueado_hasta
             FROM usuarios WHERE lower(usuario) = lower(?1)",
            params![usuario.trim()],
            |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, String>(4)?,
                    r.get::<_, i64>(5)? != 0,
                    r.get::<_, i64>(6)? != 0,
                    r.get::<_, i64>(7)?,
                    r.get::<_, Option<String>>(8)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let fail = |conn: &rusqlite::Connection, msg: &str| -> Result<UsuarioPublico, String> {
        db::log_event(conn, "login_fail", None, msg, Some(&usuario))?;
        Err("Usuario o contraseña incorrectos.".into())
    };

    let Some((id, nombre, user_name, hash, rol, activo, dev, intentos, bloqueado)) = row else {
        return fail(&conn, "Usuario no existe");
    };

    if let Some(hasta) = bloqueado.as_deref() {
        let restante = segundos_bloqueo(hasta);
        if restante > 0 {
            db::log_event(
                &conn,
                "login_fail",
                Some(id),
                "Cuenta bloqueada por intentos fallidos",
                None,
            )?;
            return Err(format!(
                "Demasiados intentos. Intente de nuevo en {restante} segundos."
            ));
        }
    }

    if !activo {
        db::log_event(&conn, "login_fail", Some(id), "Usuario inactivo", None)?;
        return Err("Este usuario está inactivo.".into());
    }

    let ok = bcrypt::verify(&password, &hash).map_err(|e| e.to_string())?;
    if !ok {
        let nuevos = intentos + 1;
        let espera = espera_por_intentos(nuevos);
        if espera > 0 {
            let hasta = (Local::now() + Duration::seconds(espera))
                .format("%Y-%m-%d %H:%M:%S")
                .to_string();
            conn.execute(
                "UPDATE usuarios SET intentos_fallidos = ?1, bloqueado_hasta = ?2 WHERE id = ?3",
                params![nuevos, hasta, id],
            )
            .map_err(|e| e.to_string())?;
            db::log_event(
                &conn,
                "login_fail",
                Some(id),
                &format!("Contraseña incorrecta; bloqueado {espera} segundos"),
                None,
            )?;
            return Err(format!(
                "Demasiados intentos. Intente de nuevo en {espera} segundos."
            ));
        }
        conn.execute(
            "UPDATE usuarios SET intentos_fallidos = ?1, bloqueado_hasta = NULL WHERE id = ?2",
            params![nuevos, id],
        )
        .map_err(|e| e.to_string())?;
        db::log_event(&conn, "login_fail", Some(id), "Contraseña incorrecta", None)?;
        return Err("Usuario o contraseña incorrectos.".into());
    }

    conn.execute(
        "UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;

    let public = UsuarioPublico {
        id,
        nombre,
        usuario: user_name,
        rol,
        activo: true,
        dev,
    };

    conn.execute(
        "INSERT INTO sesiones (usuario_id, inicio, fin, exito) VALUES (?1, ?2, NULL, 1)",
        params![id, db::now()],
    )
    .map_err(|e| e.to_string())?;
    let session_id = conn.last_insert_rowid();
    db::log_event(
        &conn,
        "login_ok",
        Some(id),
        &format!("Inicio de sesión: {}", public.usuario),
        None,
    )?;

    drop(conn);
    *state.session.lock().map_err(|_| "Error interno".to_string())? = Some(public.clone());
    *state
        .session_id
        .lock()
        .map_err(|_| "Error interno".to_string())? = Some(session_id);
    *state
        .sesion_inicio
        .lock()
        .map_err(|_| "Error interno".to_string())? = Some(db::now());
    Ok(public)
}

#[tauri::command]
pub fn logout(state: State<AppState>) -> Result<(), String> {
    let user = require_user(&state).ok();
    let session_id = *state
        .session_id
        .lock()
        .map_err(|_| "Error interno".to_string())?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    if let Some(sid) = session_id {
        conn.execute(
            "UPDATE sesiones SET fin = ?1 WHERE id = ?2",
            params![db::now(), sid],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(u) = &user {
        db::log_event(&conn, "logout", Some(u.id), "Cierre de sesión", None)?;
    }
    drop(conn);
    *state.session.lock().map_err(|_| "Error interno".to_string())? = None;
    *state
        .session_id
        .lock()
        .map_err(|_| "Error interno".to_string())? = None;
    *state
        .sesion_inicio
        .lock()
        .map_err(|_| "Error interno".to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn sesion_actual(state: State<AppState>) -> Result<Option<UsuarioPublico>, String> {
    Ok(state
        .session
        .lock()
        .map_err(|_| "Error interno".to_string())?
        .clone())
}

/// Lista pública y mínima para el selector del login: solo usuarios activos,
/// sin hashes ni datos sensibles. No requiere sesión.
#[tauri::command]
pub fn usuarios_login(state: State<AppState>) -> Result<Vec<UsuarioPublico>, String> {
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nombre, usuario, rol, activo, es_dev FROM usuarios
             WHERE activo = 1
             ORDER BY CASE rol WHEN 'admin' THEN 0 WHEN 'caja' THEN 1 ELSE 2 END, nombre",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], db::usuario_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn registrar_escaneo(state: State<AppState>, codigo: String) -> Result<(), String> {
    require_user(&state)?;
    *state
        .last_scan
        .lock()
        .map_err(|_| "Error interno".to_string())? = Some(format!("{}|{}", db::now(), codigo));
    Ok(())
}
