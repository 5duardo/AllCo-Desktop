use crate::commands::auth::{require_roles, require_user};
use crate::db;
use crate::models::{VentaIn, VentaListado, VentaResultado};
use crate::AppState;
use rusqlite::params;
use std::fs;
use tauri::State;

fn venta_listado_from_row(r: &rusqlite::Row) -> rusqlite::Result<VentaListado> {
    Ok(VentaListado {
        id: r.get(0)?,
        fecha: r.get(1)?,
        usuario_nombre: r.get(2)?,
        total: r.get(3)?,
        descuento: r.get(4)?,
        metodo_pago: r.get(5)?,
        estado: r.get(6)?,
        items: r.get(7)?,
    })
}

#[tauri::command]
pub fn crear_venta(state: State<AppState>, data: VentaIn) -> Result<VentaResultado, String> {
    let user = require_roles(&state, &["admin", "caja"])?;
    if data.items.is_empty() {
        return Err("Agregue al menos un ítem.".into());
    }
    if !matches!(
        data.metodo_pago.as_str(),
        "efectivo" | "tarjeta" | "transferencia"
    ) {
        return Err("Método de pago inválido.".into());
    }

    let mut conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let cfg = db::config_map(&conn)?;
    if data.descuento > 0.0 && user.rol != "admin" && cfg.caja_puede_descuento != "1" {
        return Err("No tiene permiso para aplicar descuentos.".into());
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let ts = db::now();
    let sucursal_id = data.sucursal_id.unwrap_or(1);

    let cliente_nombre = if let Some(cliente_id) = data.cliente_id {
        Some(
            tx.query_row(
                "SELECT nombre FROM clientes WHERE id = ?1 AND activo = 1",
                params![cliente_id],
                |r| r.get::<_, String>(0),
            )
            .map_err(|_| "Cliente no válido.".to_string())?,
        )
    } else {
        None
    };

    tx.execute(
        "INSERT INTO ventas
         (fecha, usuario_id, sucursal_id, cliente_id, total, descuento, metodo_pago, estado)
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, 'completada')",
        params![
            ts,
            user.id,
            sucursal_id,
            data.cliente_id,
            data.descuento,
            data.metodo_pago
        ],
    )
    .map_err(|e| e.to_string())?;
    let venta_id = tx.last_insert_rowid();

    let mut subtotal = 0.0;
    let mut lineas: Vec<String> = Vec::new();

    for item in &data.items {
        if item.cantidad <= 0 {
            return Err("La cantidad debe ser mayor a 0.".into());
        }
        let nombre: String;
        if item.tipo == "producto" {
            let (nom, stock, precio): (String, i64, f64) = tx
                .query_row(
                    "SELECT nombre, stock, precio_venta FROM productos WHERE id = ?1 AND activo = 1",
                    params![item.referencia_id],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .map_err(|_| "Producto no encontrado.".to_string())?;
            if item.cantidad > stock {
                return Err(format!("Stock insuficiente de {nom}. Disponible: {stock}"));
            }
            nombre = nom;
            let _ = precio;
            tx.execute(
                "UPDATE productos SET stock = stock - ?1, updated_at = ?2 WHERE id = ?3",
                params![item.cantidad, ts, item.referencia_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO movimientos_inv
                 (producto_id, tipo, cantidad, motivo, usuario_id, venta_id, fecha)
                 VALUES (?1, 'salida', ?2, 'Venta', ?3, ?4, ?5)",
                params![item.referencia_id, item.cantidad, user.id, venta_id, ts],
            )
            .map_err(|e| e.to_string())?;
        } else if item.tipo == "servicio" {
            nombre = tx
                .query_row(
                    "SELECT nombre FROM servicios WHERE id = ?1 AND activo = 1",
                    params![item.referencia_id],
                    |r| r.get(0),
                )
                .map_err(|_| "Servicio no encontrado.".to_string())?;
        } else {
            return Err("Tipo de ítem inválido.".into());
        }

        let linea = db::round2(
            item.precio_unitario * item.cantidad as f64 - item.descuento,
        );
        if linea < 0.0 {
            return Err("El descuento no puede superar el importe de la línea.".into());
        }
        subtotal += linea;
        tx.execute(
            "INSERT INTO venta_items
             (venta_id, tipo, referencia_id, cantidad, precio_unitario, descuento)
             VALUES (?1,?2,?3,?4,?5,?6)",
            params![
                venta_id,
                item.tipo,
                item.referencia_id,
                item.cantidad,
                item.precio_unitario,
                item.descuento
            ],
        )
        .map_err(|e| e.to_string())?;
        lineas.push(format!(
            "{} x {}  {}",
            item.cantidad,
            truncate(&nombre, 18),
            db::money(linea)
        ));
    }

    let total = db::round2(subtotal - data.descuento);
    if total < 0.0 {
        return Err("El total no puede ser negativo.".into());
    }
    let mut cambio = 0.0;
    if data.metodo_pago == "efectivo" {
        if data.recibido + 0.001 < total {
            return Err("El monto recibido es menor al total.".into());
        }
        cambio = db::round2(data.recibido - total);
    }

    tx.execute(
        "UPDATE ventas SET total = ?1 WHERE id = ?2",
        params![total, venta_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    let ticket = build_ticket(
        &cfg.negocio_nombre,
        &cfg.negocio_direccion,
        &cfg.ticket_pie,
        venta_id,
        &ts,
        &user.nombre,
        cliente_nombre.as_deref(),
        &lineas,
        data.descuento,
        total,
        &data.metodo_pago,
        data.recibido,
        cambio,
    );

    let tickets_dir = state.data_dir.join("tickets");
    let _ = fs::create_dir_all(&tickets_dir);
    let ticket_path = tickets_dir.join(format!("ticket-{venta_id}.txt"));
    let print_res = fs::write(&ticket_path, &ticket);
    let (impresion_ok, impresion_error) = match print_res {
        Ok(_) => {
            let _ = db::log_event(
                &conn,
                "print_ok",
                Some(user.id),
                &format!("Factura #{venta_id} generada"),
                None,
            );
            (true, None)
        }
        Err(e) => {
            let _ = db::log_event(
                &conn,
                "print_fail",
                Some(user.id),
                &format!("Factura #{venta_id}: {e}"),
                None,
            );
            (false, Some(e.to_string()))
        }
    };

    Ok(VentaResultado {
        id: venta_id,
        total,
        cambio,
        ticket,
        impresion_ok,
        impresion_error,
    })
}

fn truncate(s: &str, max: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= max {
        s.to_string()
    } else {
        chars[..max].iter().collect()
    }
}

fn build_ticket(
    negocio: &str,
    direccion: &str,
    pie: &str,
    id: i64,
    fecha: &str,
    cajero: &str,
    cliente: Option<&str>,
    lineas: &[String],
    descuento: f64,
    total: f64,
    metodo: &str,
    recibido: f64,
    cambio: f64,
) -> String {
    let mut t = String::new();
    t.push_str(&format!("{negocio}\n"));
    t.push_str(&format!("{direccion}\n"));
    t.push_str("--------------------------------\n");
    t.push_str(&format!("Factura #{id}\n"));
    t.push_str(&format!("{fecha}\n"));
    t.push_str(&format!("Cajero: {cajero}\n"));
    if let Some(c) = cliente {
        t.push_str(&format!("Cliente: {}\n", truncate(c, 28)));
    }
    t.push_str("--------------------------------\n");
    for l in lineas {
        t.push_str(l);
        t.push('\n');
    }
    t.push_str("--------------------------------\n");
    if descuento > 0.0 {
        t.push_str(&format!("Descuento      {}\n", db::money(descuento)));
    }
    t.push_str(&format!("TOTAL          {}\n", db::money(total)));
    t.push_str(&format!("Pago: {metodo}\n"));
    if metodo == "efectivo" {
        t.push_str(&format!("Recibido       {}\n", db::money(recibido)));
        t.push_str(&format!("Cambio         {}\n", db::money(cambio)));
    }
    t.push_str("--------------------------------\n");
    t.push_str(pie);
    t.push('\n');
    t
}

#[tauri::command]
pub fn anular_venta(
    state: State<AppState>,
    venta_id: i64,
    motivo: String,
) -> Result<(), String> {
    let user = require_roles(&state, &["admin"])?;
    if motivo.trim().len() < 3 {
        return Err("Indique el motivo de anulación.".into());
    }
    let mut conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let estado: String = tx
        .query_row(
            "SELECT estado FROM ventas WHERE id = ?1",
            params![venta_id],
            |r| r.get(0),
        )
        .map_err(|_| "Venta no encontrada.".to_string())?;
    if estado == "anulada" {
        return Err("Esta venta ya está anulada.".into());
    }

    let mut stmt = tx
        .prepare(
            "SELECT tipo, referencia_id, cantidad FROM venta_items WHERE venta_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let items: Vec<(String, i64, i64)> = stmt
        .query_map(params![venta_id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);

    let ts = db::now();
    for (tipo, ref_id, qty) in items {
        if tipo == "producto" {
            tx.execute(
                "UPDATE productos SET stock = stock + ?1, updated_at = ?2 WHERE id = ?3",
                params![qty, ts, ref_id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO movimientos_inv
                 (producto_id, tipo, cantidad, motivo, usuario_id, venta_id, fecha)
                 VALUES (?1, 'entrada', ?2, ?3, ?4, ?5, ?6)",
                params![
                    ref_id,
                    qty,
                    format!("Anulación venta #{venta_id}"),
                    user.id,
                    venta_id,
                    ts
                ],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.execute(
        "UPDATE ventas SET estado = 'anulada', motivo_anulacion = ?1 WHERE id = ?2",
        params![motivo.trim(), venta_id],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn listar_ventas(
    state: State<AppState>,
    desde: Option<String>,
    hasta: Option<String>,
) -> Result<Vec<VentaListado>, String> {
    require_roles(&state, &["admin", "caja"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let d = desde.unwrap_or_else(|| "2000-01-01".into());
    let h = hasta.unwrap_or_else(|| "2100-12-31".into());
    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.fecha, u.nombre, v.total, v.descuento, v.metodo_pago, v.estado,
                    (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id)
             FROM ventas v
             JOIN usuarios u ON u.id = v.usuario_id
             WHERE date(v.fecha) >= date(?1) AND date(v.fecha) <= date(?2)
             ORDER BY v.id DESC LIMIT 300",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![d, h], venta_listado_from_row)
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn obtener_ticket(state: State<AppState>, venta_id: i64) -> Result<String, String> {
    require_user(&state)?;
    let path = state.data_dir.join("tickets").join(format!("ticket-{venta_id}.txt"));
    fs::read_to_string(&path).map_err(|_| "No hay copia de la factura.".to_string())
}
