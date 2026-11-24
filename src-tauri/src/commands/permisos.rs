use crate::commands::auth::{require_roles, require_user};
use crate::db;
use crate::models::PermisoModuloIn;
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// Permisos del usuario en sesión. `None` = usar el acceso por rol.
#[tauri::command]
pub fn mis_permisos(state: State<AppState>) -> Result<Option<Vec<String>>, String> {
    let user = require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::permisos_usuario(&conn, user.id)
}

#[tauri::command]
pub fn obtener_permisos(
    state: State<AppState>,
    usuario_id: i64,
) -> Result<Option<Vec<String>>, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    db::permisos_usuario(&conn, usuario_id)
}

#[tauri::command]
pub fn guardar_permisos(
    state: State<AppState>,
    usuario_id: i64,
    modulos: Vec<PermisoModuloIn>,
) -> Result<(), String> {
    let admin = require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let existe: i64 = conn
        .query_row("SELECT COUNT(*) FROM usuarios WHERE id = ?1", params![usuario_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if existe == 0 {
        return Err("El usuario ya no existe.".into());
    }

    let mut claves: Vec<String> = Vec::new();
    for m in modulos {
        let modulo = m.modulo.trim();
        if modulo.is_empty() {
            continue;
        }
        // `m:` marca acceso al módulo sin implicar acciones; las claves
        // `modulo:accion` habilitan cada acción por separado.
        claves.push(format!("m:{modulo}"));
        if m.crear {
            claves.push(format!("{modulo}:crear"));
        }
        if m.editar {
            claves.push(format!("{modulo}:editar"));
        }
        if m.eliminar {
            claves.push(format!("{modulo}:eliminar"));
        }
    }
    claves.sort();
    claves.dedup();

    conn.execute(
        "DELETE FROM usuario_permisos WHERE usuario_id = ?1",
        params![usuario_id],
    )
    .map_err(|e| e.to_string())?;
    // Un marcador conserva el hecho de que el usuario tiene permisos
    // personalizados incluso cuando no se marca ningún módulo.
    if claves.is_empty() {
        claves.push("_".into());
    }
    for modulo in &claves {
        conn.execute(
            "INSERT INTO usuario_permisos (usuario_id, modulo) VALUES (?1, ?2)",
            params![usuario_id, modulo],
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = db::log_event(
        &conn,
        "permisos",
        Some(admin.id),
        &format!("Permisos actualizados para el usuario #{usuario_id}"),
        None,
    );
    Ok(())
}
