use crate::commands::auth::{require_accion, require_roles};
use crate::db;
use crate::models::{HoraExtra, HoraExtraIn};
use crate::AppState;
use chrono::{Datelike, Local, NaiveDate};
use rusqlite::params;
use tauri::State;

fn fecha_valida(s: &str) -> Result<String, String> {
    let corta = s.trim().chars().take(10).collect::<String>();
    NaiveDate::parse_from_str(&corta, "%Y-%m-%d")
        .map(|_| corta)
        .map_err(|_| "La fecha no es válida.".into())
}

fn hora_extra_row(r: &rusqlite::Row) -> rusqlite::Result<HoraExtra> {
    Ok(HoraExtra {
        id: r.get(0)?,
        empleado_id: r.get(1)?,
        empleado_nombre: r.get(2)?,
        fecha: r.get(3)?,
        horas: r.get(4)?,
        monto: r.get(5)?,
        nota: r.get(6)?,
        gasto_id: r.get(7)?,
        created_at: r.get(8)?,
    })
}

fn insertar_gasto(
    tx: &rusqlite::Transaction,
    fecha: &str,
    descripcion: &str,
    monto: f64,
    usuario_id: i64,
    ts: &str,
) -> Result<i64, String> {
    tx.execute(
        "INSERT INTO gastos (fecha, categoria, descripcion, monto, metodo_pago,
                             proveedor_id, usuario_id, created_at)
         VALUES (?1, 'Sueldos', ?2, ?3, 'efectivo', NULL, ?4, ?5)",
        params![fecha, descripcion, monto, usuario_id, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(tx.last_insert_rowid())
}

#[tauri::command]
pub fn listar_horas_extras(
    state: State<AppState>,
    empleado_id: Option<i64>,
    desde: Option<String>,
    hasta: Option<String>,
) -> Result<Vec<HoraExtra>, String> {
    require_roles(&state, &["admin"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let hoy = Local::now().date_naive();
    let d = desde
        .map(|s| fecha_valida(&s))
        .transpose()?
        .unwrap_or_else(|| hoy.with_day(1).unwrap().format("%Y-%m-%d").to_string());
    let h = hasta
        .map(|s| fecha_valida(&s))
        .transpose()?
        .unwrap_or_else(|| hoy.format("%Y-%m-%d").to_string());

    let sql = "SELECT h.id, h.empleado_id, e.nombre, h.fecha, h.horas, h.monto, h.nota,
                      h.gasto_id, h.created_at
               FROM horas_extras h JOIN empleados e ON e.id = h.empleado_id
               WHERE date(h.fecha) >= date(?1) AND date(h.fecha) <= date(?2)
                 AND (?3 IS NULL OR h.empleado_id = ?3)
               ORDER BY h.fecha DESC, h.id DESC";
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![d, h, empleado_id], hora_extra_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guardar_hora_extra(state: State<AppState>, data: HoraExtraIn) -> Result<i64, String> {
    let user = require_roles(&state, &["admin"])?;
    require_accion(
        &state,
        "/finanzas",
        if data.id.is_some() { "editar" } else { "crear" },
    )?;

    let fecha = fecha_valida(&data.fecha)?;
    let horas = db::round2(data.horas);
    if horas <= 0.0 {
        return Err("Las horas deben ser mayores a cero.".into());
    }
    let monto = db::round2(data.monto);
    if monto <= 0.0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    let nota = data.nota.trim();

    let mut conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let nombre: String = conn
        .query_row(
            "SELECT nombre FROM empleados WHERE id = ?1 AND activo = 1",
            params![data.empleado_id],
            |r| r.get(0),
        )
        .map_err(|_| "Empleado no válido.".to_string())?;

    let descripcion = format!("Horas extras · {nombre} · {horas} h");
    let ts = db::now();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let id = if let Some(id) = data.id {
        let gasto_id: Option<i64> = tx
            .query_row(
                "SELECT gasto_id FROM horas_extras WHERE id = ?1",
                params![id],
                |r| r.get(0),
            )
            .map_err(|_| "El registro ya no existe.".to_string())?;
        let n = tx
            .execute(
                "UPDATE horas_extras SET empleado_id = ?1, fecha = ?2, horas = ?3,
                        monto = ?4, nota = ?5 WHERE id = ?6",
                params![data.empleado_id, fecha, horas, monto, nota, id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("El registro ya no existe.".to_string());
        }
        match gasto_id {
            Some(gasto_id) => {
                tx.execute(
                    "UPDATE gastos SET fecha = ?1, categoria = 'Sueldos', descripcion = ?2,
                            monto = ?3 WHERE id = ?4",
                    params![fecha, descripcion, monto, gasto_id],
                )
                .map_err(|e| e.to_string())?;
            }
            None => {
                let gasto_id = insertar_gasto(&tx, &fecha, &descripcion, monto, user.id, &ts)?;
                tx.execute(
                    "UPDATE horas_extras SET gasto_id = ?1 WHERE id = ?2",
                    params![gasto_id, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        id
    } else {
        let gasto_id = insertar_gasto(&tx, &fecha, &descripcion, monto, user.id, &ts)?;
        tx.execute(
            "INSERT INTO horas_extras
             (empleado_id, fecha, horas, monto, nota, gasto_id, usuario_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                data.empleado_id,
                fecha,
                horas,
                monto,
                nota,
                gasto_id,
                user.id,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;
        tx.last_insert_rowid()
    };
    tx.commit().map_err(|e| e.to_string())?;

    let _ = db::log_event(
        &conn,
        "hora_extra",
        Some(user.id),
        &format!(
            "Horas extras {} de {} por {}",
            if data.id.is_some() { "editadas" } else { "registradas" },
            nombre,
            db::money(monto)
        ),
        None,
    );
    Ok(id)
}

#[tauri::command]
pub fn eliminar_hora_extra(state: State<AppState>, id: i64) -> Result<(), String> {
    let user = require_roles(&state, &["admin"])?;
    require_accion(&state, "/finanzas", "eliminar")?;

    let mut conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let gasto_id: Option<i64> = tx
        .query_row(
            "SELECT gasto_id FROM horas_extras WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "El registro ya no existe.".to_string())?;
    tx.execute("DELETE FROM horas_extras WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    if let Some(gasto_id) = gasto_id {
        tx.execute("DELETE FROM gastos WHERE id = ?1", params![gasto_id])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;

    let _ = db::log_event(
        &conn,
        "hora_extra",
        Some(user.id),
        &format!("Horas extras #{id} eliminadas"),
        None,
    );
    Ok(())
}
