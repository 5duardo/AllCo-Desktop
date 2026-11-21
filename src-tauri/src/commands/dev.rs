use crate::commands::auth::require_dev;
use crate::db;
use crate::models::EstadoPruebas;
use crate::AppState;
use rusqlite::{params, Connection};
use tauri::State;

fn estado(conn: &Connection) -> Result<EstadoPruebas, String> {
    let count = |sql: &str| -> Result<i64, String> {
        conn.query_row(sql, [], |r| r.get(0))
            .map_err(|e| e.to_string())
    };
    Ok(EstadoPruebas {
        productos: count("SELECT COUNT(*) FROM productos")?,
        servicios: count("SELECT COUNT(*) FROM servicios")?,
        clientes: count("SELECT COUNT(*) FROM clientes")?,
        ventas: count("SELECT COUNT(*) FROM ventas")?,
    })
}

#[tauri::command]
pub fn estado_pruebas(state: State<AppState>) -> Result<EstadoPruebas, String> {
    require_dev(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    estado(&conn)
}

#[tauri::command]
pub fn agregar_datos_ejemplo(
    state: State<AppState>,
    tipo: String,
) -> Result<EstadoPruebas, String> {
    let dev = require_dev(&state)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let ts = db::now();

    if tipo == "productos" || tipo == "todo" {
        for i in 1..=6 {
            let sku = format!("DEMO-{i:03}");
            let codigo = format!("99900000{i:04}");
            let nombre = format!("Producto de ejemplo {i}");
            let precio = 100.0 + i as f64 * 25.0;
            conn.execute(
                "INSERT INTO productos
                    (sku, codigo_barras, nombre, marca, medida, modelo, dot, proveedor_id,
                     costo, precio_venta, stock, stock_minimo, sucursal_id, activo, created_at, updated_at)
                 SELECT ?1, ?2, ?3, 'Marca demo', 'Unidad', 'Demo', '', NULL,
                        50, ?4, 10, 2, NULL, 1, ?5, ?5
                 WHERE NOT EXISTS (SELECT 1 FROM productos WHERE sku = ?1)",
                params![sku, codigo, nombre, precio, ts],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if tipo == "servicios" || tipo == "todo" {
        for i in 1..=4 {
            let nombre = format!("Servicio de ejemplo {i}");
            let precio = 100.0 + i as f64 * 50.0;
            conn.execute(
                "INSERT INTO servicios (nombre, descripcion, precio, duracion_min, activo)
                 SELECT ?1, 'Servicio de ejemplo para pruebas', ?2, 20, 1
                 WHERE NOT EXISTS (SELECT 1 FROM servicios WHERE nombre = ?1)",
                params![nombre, precio],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if tipo == "clientes" || tipo == "todo" {
        for i in 1..=4 {
            let nombre = format!("Cliente de ejemplo {i}");
            let telefono = format!("9999-000{i}");
            let correo = format!("cliente{i}@allco.online");
            conn.execute(
                "INSERT INTO clientes (nombre, telefono, correo, direccion, activo, created_at)
                 SELECT ?1, ?2, ?3, 'Dirección de ejemplo', 1, ?4
                 WHERE NOT EXISTS (SELECT 1 FROM clientes WHERE nombre = ?1)",
                params![nombre, telefono, correo, ts],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    if tipo == "ventas" || tipo == "todo" {
        let productos: Vec<(i64, f64, i64)> = {
            let mut stmt = conn
                .prepare(
                    "SELECT id, precio_venta, stock FROM productos
                     WHERE activo = 1 AND stock > 0 AND sku LIKE 'DEMO-%'
                     ORDER BY id LIMIT 4",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };
        let clientes: Vec<i64> = {
            let mut stmt = conn
                .prepare("SELECT id FROM clientes WHERE activo = 1 ORDER BY id LIMIT 4")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };

        if !productos.is_empty() {
            for (indice, (producto_id, precio, stock)) in productos.iter().enumerate() {
                if *stock <= 0 {
                    continue;
                }
                let cliente_id = clientes.get(indice).copied();
                conn.execute(
                    "INSERT INTO ventas
                        (fecha, usuario_id, sucursal_id, cliente_id, total, descuento, metodo_pago, estado, motivo_anulacion)
                     VALUES (?1, ?2, NULL, ?3, ?4, 0, 'efectivo', 'completada', 'DEMO')",
                    params![ts, dev.id, cliente_id, precio],
                )
                .map_err(|e| e.to_string())?;
                let venta_id = conn.last_insert_rowid();
                conn.execute(
                    "INSERT INTO venta_items
                        (venta_id, tipo, referencia_id, cantidad, precio_unitario, descuento)
                     VALUES (?1, 'producto', ?2, 1, ?3, 0)",
                    params![venta_id, producto_id, precio],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "UPDATE productos SET stock = stock - 1, updated_at = ?1 WHERE id = ?2",
                    params![ts, producto_id],
                )
                .map_err(|e| e.to_string())?;
                conn.execute(
                    "INSERT INTO movimientos_inv
                        (producto_id, tipo, cantidad, motivo, usuario_id, venta_id, fecha)
                     VALUES (?1, 'salida', 1, 'Venta de ejemplo', ?2, ?3, ?4)",
                    params![producto_id, dev.id, venta_id, ts],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    estado(&conn)
}
