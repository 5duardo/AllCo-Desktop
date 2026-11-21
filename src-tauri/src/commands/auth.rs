use crate::db;
use crate::models::UsuarioPublico;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

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

pub fn require_dev(state: &AppState) -> Result<UsuarioPublico, String> {
    let user = require_user(state)?;
    if !user.dev {
        return Err("Solo el usuario de desarrollo puede usar esta función.".into());
    }
    Ok(user)
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
            "SELECT id, nombre, usuario, password_hash, rol, activo, es_dev
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
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let fail = |conn: &rusqlite::Connection, msg: &str| -> Result<UsuarioPublico, String> {
        db::log_event(conn, "login_fail", None, msg, Some(&usuario))?;
        Err("Usuario o contraseña incorrectos.".into())
    };

    let Some((id, nombre, user_name, hash, rol, activo, dev)) = row else {
        return fail(&conn, "Usuario no existe");
    };

    if !activo {
        db::log_event(&conn, "login_fail", Some(id), "Usuario inactivo", None)?;
        return Err("Este usuario está inactivo.".into());
    }

    let ok = bcrypt::verify(&password, &hash).map_err(|e| e.to_string())?;
    if !ok {
        return fail(&conn, "Contraseña incorrecta");
    }

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
