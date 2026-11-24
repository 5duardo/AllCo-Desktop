use crate::commands::auth::{require_accion, require_roles};
use crate::db;
use crate::models::{Cliente, ClienteIn, VentaListado};
use crate::AppState;
use rusqlite::params;
use tauri::State;

fn cliente_row(r: &rusqlite::Row) -> rusqlite::Result<Cliente> {
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
                (SELECT COALESCE(SUM(v.total),0) FROM ventas v WHERE v.cliente_id = c.id AND v.estado = 'completada')
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
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.fecha, u.nombre, v.total, v.descuento, v.metodo_pago, v.estado,
                    (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id), c.nombre
             FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
             LEFT JOIN clientes c ON c.id = v.cliente_id
             WHERE v.cliente_id = ?1
             ORDER BY v.id DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![cliente_id], |r| {
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
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
