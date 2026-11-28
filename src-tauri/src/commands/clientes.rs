use crate::commands::auth::{rango_ventas, require_accion, require_roles};
use crate::db;
use crate::models::{Cliente, ClienteIn, VentaListado};
use crate::AppState;
use rusqlite::params;
use tauri::State;

fn cliente_row(r: &rusqlite::Row) -> rusqlite::Result<Cliente> {
    let ventas_contado: i64 = r.get(9)?;
    let ventas_credito: i64 = r.get(10)?;
    let condicion = match (ventas_contado, ventas_credito) {
        (0, 0) => "sin_ventas",
        (_, 0) => "contado",
        (0, _) => "credito",
        _ => "mixto",
    }
    .to_string();
    Ok(Cliente {
        id: r.get(0)?,
        nombre: r.get(1)?,
        telefono: r.get(2)?,
        correo: r.get(3)?,
        direccion: r.get(4)?,
        activo: r.get::<_, i64>(5)? != 0,
        created_at: r.get(6)?,
        facturas: r.get(7)?,
        total_comprado: r.get(8)?,
        ventas_contado,
        ventas_credito,
        total_contado: r.get(11)?,
        total_credito: r.get(12)?,
        condicion,
    })
}

#[tauri::command]
pub fn listar_clientes(
    state: State<AppState>,
    q: Option<String>,
    solo_activos: Option<bool>,
) -> Result<Vec<Cliente>, String> {
    require_roles(&state, &["admin", "caja"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let mut sql = String::from(
        "SELECT c.id, c.nombre, c.telefono, c.correo, c.direccion, c.activo, c.created_at,
                (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada'),
                (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada'),
                (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada' AND v.condicion = 'contado'),
                (SELECT COUNT(*) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada' AND v.condicion = 'credito'),
                (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada' AND v.condicion = 'contado'),
                (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada' AND v.condicion = 'credito')
         FROM clientes c WHERE 1=1",
    );
    if solo_activos.unwrap_or(true) {
        sql.push_str(" AND c.activo = 1");
    }
    let busca = q.unwrap_or_default().trim().to_string();
    if !busca.is_empty() {
        sql.push_str(" AND (c.nombre LIKE ?1 OR c.telefono LIKE ?1 OR c.correo LIKE ?1)");
    }
    sql.push_str(" ORDER BY c.nombre");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    if busca.is_empty() {
        let rows = stmt
            .query_map([], cliente_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    } else {
        let rows = stmt
            .query_map(params![busca], cliente_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn guardar_cliente(state: State<AppState>, data: ClienteIn) -> Result<i64, String> {
    require_roles(&state, &["admin", "caja"])?;
    require_accion(
        &state,
        "/clientes",
        if data.id.is_some() { "editar" } else { "crear" },
    )?;
    if data.nombre.trim().is_empty() {
        return Err("El nombre del cliente es obligatorio.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    if let Some(id) = data.id {
        conn.execute(
            "UPDATE clientes SET nombre = ?1, telefono = ?2, correo = ?3,
                    direccion = ?4, activo = ?5 WHERE id = ?6",
            params![
                data.nombre.trim(),
                data.telefono.trim(),
                data.correo.trim(),
                data.direccion.trim(),
                data.activo,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO clientes (nombre, telefono, correo, direccion, activo, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                data.nombre.trim(),
                data.telefono.trim(),
                data.correo.trim(),
                data.direccion.trim(),
                data.activo,
                db::now()
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}

#[tauri::command]
pub fn facturas_cliente(
    state: State<AppState>,
    cliente_id: i64,
) -> Result<Vec<VentaListado>, String> {
    require_roles(&state, &["admin", "caja"])?;
    let (d, h) = rango_ventas(&state, None, None);
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.fecha, u.nombre, v.total, v.descuento, v.metodo_pago, v.estado,
                    (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id), c.nombre,
                    v.condicion
             FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
             LEFT JOIN clientes c ON c.id = v.cliente_id
             WHERE v.cliente_id = ?1 AND date(v.fecha) >= date(?2) AND date(v.fecha) <= date(?3)
             ORDER BY v.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![cliente_id, d, h], |r| {
            Ok(VentaListado {
                id: r.get(0)?,
                fecha: r.get(1)?,
                usuario_nombre: r.get(2)?,
                total: r.get(3)?,
                descuento: r.get(4)?,
                metodo_pago: r.get(5)?,
                estado: r.get(6)?,
                items: r.get(7)?,
                cliente_nombre: r.get(8)?,
                condicion: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
