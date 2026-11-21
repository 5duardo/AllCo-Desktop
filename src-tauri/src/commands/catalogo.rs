use crate::commands::auth::{require_roles, require_user};
use crate::db::{self, PRODUCTO_SELECT};
use crate::models::{
    CatalogoSimple, Movimiento, Producto, ProductoIn, Servicio, ServicioIn,
};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

#[tauri::command]
pub fn listar_proveedores(state: State<AppState>) -> Result<Vec<CatalogoSimple>, String> {
    require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre FROM proveedores WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(CatalogoSimple {
                id: r.get(0)?,
                nombre: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn listar_sucursales(state: State<AppState>) -> Result<Vec<CatalogoSimple>, String> {
    require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, nombre FROM sucursales WHERE activo = 1 ORDER BY nombre")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(CatalogoSimple {
                id: r.get(0)?,
                nombre: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?)
}

#[tauri::command]
pub fn listar_productos(
    state: State<AppState>,
    q: Option<String>,
    solo_activos: Option<bool>,
) -> Result<Vec<Producto>, String> {
    let user = require_user(&state)?;
    let show_cost = user.rol == "admin";
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let mut sql = PRODUCTO_SELECT.to_string();
    sql.push_str(" WHERE 1=1");
    if solo_activos.unwrap_or(true) {
        sql.push_str(" AND p.activo = 1");
    }
    let query = q.unwrap_or_default();
    let trimmed = query.trim().to_string();
    if !trimmed.is_empty() {
        sql.push_str(
            " AND (p.nombre LIKE ?1 OR p.codigo_barras LIKE ?1 OR p.sku LIKE ?1
              OR p.marca LIKE ?1 OR p.medida LIKE ?1)",
        );
    }
    sql.push_str(" ORDER BY p.nombre");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let map_row = |r: &rusqlite::Row| db::map_producto(r, show_cost);
    if trimmed.is_empty() {
        let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    } else {
        let like = format!("%{trimmed}%");
        let rows = stmt
            .query_map(params![like], map_row)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn buscar_producto_codigo(
    state: State<AppState>,
    codigo: String,
) -> Result<Option<Producto>, String> {
    let user = require_user(&state)?;
    let show_cost = user.rol == "admin";
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let sql = format!("{PRODUCTO_SELECT} WHERE p.activo = 1 AND p.codigo_barras = ?1");
    conn.query_row(&sql, params![codigo.trim()], |r| {
        db::map_producto(r, show_cost)
    })
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guardar_producto(state: State<AppState>, data: ProductoIn) -> Result<i64, String> {
    let user = require_roles(&state, &["admin", "bodega"])?;
    if data.nombre.trim().is_empty() {
        return Err("El nombre es obligatorio.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let ts = db::now();
    let costo = if user.rol == "admin" {
        data.costo
    } else if let Some(id) = data.id {
        conn.query_row("SELECT costo FROM productos WHERE id = ?1", params![id], |r| {
            r.get(0)
        })
        .unwrap_or(0.0)
    } else {
        0.0
    };

    if let Some(id) = data.id {
        conn.execute(
            "UPDATE productos SET sku=?1, codigo_barras=?2, nombre=?3, marca=?4, medida=?5,
             modelo=?6, dot=?7, proveedor_id=?8, costo=?9, precio_venta=?10, stock_minimo=?11,
             sucursal_id=?12, activo=?13, updated_at=?14 WHERE id=?15",
            params![
                data.sku.trim(),
                data.codigo_barras.trim(),
                data.nombre.trim(),
                data.marca.trim(),
                data.medida.trim(),
                data.modelo.trim(),
                data.dot.trim(),
                data.proveedor_id,
                costo,
                data.precio_venta,
                data.stock_minimo,
                data.sucursal_id,
                if data.activo { 1 } else { 0 },
                ts,
                id
            ],
        )
        .map_err(|e| map_sql_error(e))?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO productos
             (sku, codigo_barras, nombre, marca, medida, modelo, dot, proveedor_id,
              costo, precio_venta, stock, stock_minimo, sucursal_id, activo, created_at, updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?15)",
            params![
                data.sku.trim(),
                data.codigo_barras.trim(),
                data.nombre.trim(),
                data.marca.trim(),
                data.medida.trim(),
                data.modelo.trim(),
                data.dot.trim(),
                data.proveedor_id,
                costo,
                data.precio_venta,
                data.stock,
                data.stock_minimo,
                data.sucursal_id,
                if data.activo { 1 } else { 0 },
                ts
            ],
        )
        .map_err(|e| map_sql_error(e))?;
        let id = conn.last_insert_rowid();
        if data.stock != 0 {
            conn.execute(
                "INSERT INTO movimientos_inv (producto_id, tipo, cantidad, motivo, usuario_id, fecha)
                 VALUES (?1, 'entrada', ?2, 'Stock inicial', ?3, ?4)",
                params![id, data.stock, user.id, ts],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(id)
    }
}

fn map_sql_error(e: rusqlite::Error) -> String {
    let s = e.to_string();
    if s.contains("UNIQUE") {
        "Ya existe un producto activo con ese código de barras.".into()
    } else {
        s
    }
}

#[tauri::command]
pub fn movimiento_inventario(
    state: State<AppState>,
    producto_id: i64,
    tipo: String,
    cantidad: i64,
    motivo: String,
) -> Result<i64, String> {
    let user = require_roles(&state, &["admin", "bodega"])?;
    if cantidad < 0 {
        return Err("La cantidad no puede ser negativa.".into());
    }
    if !matches!(tipo.as_str(), "entrada" | "salida" | "ajuste") {
        return Err("Tipo de movimiento inválido.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let stock: i64 = conn
        .query_row(
            "SELECT stock FROM productos WHERE id = ?1 AND activo = 1",
            params![producto_id],
            |r| r.get(0),
        )
        .map_err(|_| "Producto no encontrado.".to_string())?;

    let (new_stock, qty_record) = match tipo.as_str() {
        "entrada" => (stock + cantidad, cantidad),
        "salida" => {
            if cantidad > stock {
                return Err(format!("Stock insuficiente. Disponible: {stock}"));
            }
            (stock - cantidad, cantidad)
        }
        "ajuste" => (cantidad, cantidad - stock),
        _ => unreachable!(),
    };

    let ts = db::now();
    conn.execute(
        "UPDATE productos SET stock = ?1, updated_at = ?2 WHERE id = ?3",
        params![new_stock, ts, producto_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO movimientos_inv (producto_id, tipo, cantidad, motivo, usuario_id, fecha)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![producto_id, tipo, qty_record, motivo.trim(), user.id, ts],
    )
    .map_err(|e| e.to_string())?;
    Ok(new_stock)
}

#[tauri::command]
pub fn kardex(
    state: State<AppState>,
    producto_id: Option<i64>,
    desde: Option<String>,
    hasta: Option<String>,
) -> Result<Vec<Movimiento>, String> {
    require_roles(&state, &["admin", "bodega"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let sql = "SELECT m.id, m.producto_id, p.nombre, m.tipo, m.cantidad, m.motivo,
                COALESCE(u.nombre, ''), m.fecha
         FROM movimientos_inv m
         JOIN productos p ON p.id = m.producto_id
         LEFT JOIN usuarios u ON u.id = m.usuario_id
         WHERE (?1 = 0 OR m.producto_id = ?1)
           AND (?2 = '' OR date(m.fecha) >= date(?2))
           AND (?3 = '' OR date(m.fecha) <= date(?3))
         ORDER BY m.id DESC LIMIT 500";

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let pid = producto_id.unwrap_or(0);
    let d = desde.unwrap_or_default();
    let h = hasta.unwrap_or_default();
    let rows = stmt
        .query_map(params![pid, d, h], |r| {
            Ok(Movimiento {
                id: r.get(0)?,
                producto_id: r.get(1)?,
                producto_nombre: r.get(2)?,
                tipo: r.get(3)?,
                cantidad: r.get(4)?,
                motivo: r.get(5)?,
                usuario_nombre: r.get(6)?,
                fecha: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn listar_servicios(
    state: State<AppState>,
    solo_activos: Option<bool>,
) -> Result<Vec<Servicio>, String> {
    require_user(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let sql = if solo_activos.unwrap_or(true) {
        "SELECT id, nombre, descripcion, precio, duracion_min, activo FROM servicios WHERE activo = 1 ORDER BY nombre"
    } else {
        "SELECT id, nombre, descripcion, precio, duracion_min, activo FROM servicios ORDER BY nombre"
    };
    let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Servicio {
                id: r.get(0)?,
                nombre: r.get(1)?,
                descripcion: r.get(2)?,
                precio: r.get(3)?,
                duracion_min: r.get(4)?,
                activo: r.get::<_, i64>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn guardar_servicio(state: State<AppState>, data: ServicioIn) -> Result<i64, String> {
    require_roles(&state, &["admin"])?;
    if data.nombre.trim().is_empty() {
        return Err("El nombre del servicio es obligatorio.".into());
    }
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    if let Some(id) = data.id {
        conn.execute(
            "UPDATE servicios SET nombre=?1, descripcion=?2, precio=?3, duracion_min=?4, activo=?5
             WHERE id=?6",
            params![
                data.nombre.trim(),
                data.descripcion.trim(),
                data.precio,
                data.duracion_min,
                if data.activo { 1 } else { 0 },
                id
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    } else {
        conn.execute(
            "INSERT INTO servicios (nombre, descripcion, precio, duracion_min, activo)
             VALUES (?1,?2,?3,?4,?5)",
            params![
                data.nombre.trim(),
                data.descripcion.trim(),
                data.precio,
                data.duracion_min,
                if data.activo { 1 } else { 0 }
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(conn.last_insert_rowid())
    }
}
