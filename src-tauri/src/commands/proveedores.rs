use crate::commands::auth::{require_accion, require_roles};
use crate::models::{Proveedor, ProveedorIn};
use crate::AppState;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn listar_proveedores_detalle(
    state: State<AppState>,
    solo_activos: Option<bool>,
) -> Result<Vec<Proveedor>, String> {
    require_roles(&state, &["admin", "bodega"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let sql = if solo_activos.unwrap_or(false) {
        "SELECT id, nombre, contacto, telefono, activo FROM proveedores WHERE activo = 1 ORDER BY nombre"
    } else {
        "SELECT id, nombre, contacto, telefono, activo FROM proveedores ORDER BY nombre"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Proveedor {
                id: r.get(0)?,
                nombre: r.get(1)?,
                contacto: r.get(2)?,
                telefono: r.get(3)?,
                activo: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guardar_proveedor(state: State<AppState>, data: ProveedorIn) -> Result<i64, String> {
    require_roles(&state, &["admin", "bodega"])?;
    require_accion(
        &state,
        "/proveedores",
        if data.id.is_some() { "editar" } else { "crear" },
    )?;
    if data.nombre.trim().is_empty() {
        return Err("El nombre del proveedor es obligatorio.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    if let Some(id) = data.id {
        conn.execute(
            "UPDATE proveedores SET nombre = ?1, contacto = ?2, telefono = ?3, activo = ?4 WHERE id = ?5",
            params![
                data.nombre.trim(),
                data.contacto.trim(),
                data.telefono.trim(),
                data.activo,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO proveedores (nombre, contacto, telefono, activo) VALUES (?1, ?2, ?3, ?4)",
            params![
                data.nombre.trim(),
                data.contacto.trim(),
                data.telefono.trim(),
                data.activo
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}
