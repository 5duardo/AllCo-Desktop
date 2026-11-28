use crate::commands::auth::{require_accion, require_roles};
use crate::db;
use crate::models::{Empleado, EmpleadoIn};
use crate::AppState;
use rusqlite::params;
use tauri::State;

fn empleado_row(r: &rusqlite::Row) -> rusqlite::Result<Empleado> {
    Ok(Empleado {
        id: r.get(0)?,
        nombre: r.get(1)?,
        puesto: r.get(2)?,
        telefono: r.get(3)?,
        activo: r.get::<_, i64>(4)? != 0,
        created_at: r.get(5)?,
        horas_extra_registros: r.get(6)?,
        horas_extra_horas: r.get(7)?,
        horas_extra_pagado: r.get(8)?,
    })
}

#[tauri::command]
pub fn listar_empleados(
    state: State<AppState>,
    solo_activos: Option<bool>,
) -> Result<Vec<Empleado>, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut sql = String::from(
        "SELECT e.id, e.nombre, e.puesto, e.telefono, e.activo, e.created_at,
                (SELECT COUNT(*) FROM horas_extras h WHERE h.empleado_id = e.id),
                (SELECT COALESCE(SUM(h.horas),0) FROM horas_extras h WHERE h.empleado_id = e.id),
                (SELECT COALESCE(SUM(h.monto),0) FROM horas_extras h WHERE h.empleado_id = e.id)
         FROM empleados e WHERE 1=1",
    );
    if solo_activos.unwrap_or(false) {
        sql.push_str(" AND e.activo = 1");
    }
    sql.push_str(" ORDER BY e.nombre");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], empleado_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guardar_empleado(state: State<AppState>, data: EmpleadoIn) -> Result<i64, String> {
    require_roles(&state, &["admin"])?;
    require_accion(
        &state,
        "/empleados",
        if data.id.is_some() { "editar" } else { "crear" },
    )?;
    if data.nombre.trim().is_empty() {
        return Err("El nombre del empleado es obligatorio.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    if let Some(id) = data.id {
        conn.execute(
            "UPDATE empleados SET nombre = ?1, puesto = ?2, telefono = ?3, activo = ?4 WHERE id = ?5",
            params![
                data.nombre.trim(),
                data.puesto.trim(),
                data.telefono.trim(),
                data.activo,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO empleados (nombre, puesto, telefono, activo, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                data.nombre.trim(),
                data.puesto.trim(),
                data.telefono.trim(),
                data.activo,
                db::now()
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}
