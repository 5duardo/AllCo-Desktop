use crate::commands::auth::{require_roles, require_user};
use crate::db;
use crate::models::{ConfigApp, VentaIn, VentaListado, VentaResultado};
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
        cliente_nombre: r.get(8)?,
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
    let mut lineas: Vec<(i64, String, f64)> = Vec::new();

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
        lineas.push((item.cantidad, nombre.clone(), linea));
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
        &cfg,
        venta_id,
        &ts,
        &user.nombre,
        cliente_nombre.as_deref(),
        &lineas,
        subtotal,
        data.descuento,
        total,
        &data.metodo_pago,
        data.recibido,
        cambio,
    );

    let tickets_dir = state.data_dir.join("tickets");
    let _ = fs::create_dir_all(&tickets_dir);
    let ticket_path = tickets_dir.join(format!("ticket-{venta_id}.txt"));
    let _ = fs::write(&ticket_path, &ticket);

    // Impresión física en la impresora elegida en la página Dispositivos.
    let (impresora, _, _) = super::dispositivos::configuracion_impresora(&conn);
    let (impresion_ok, impresion_error) = if impresora.trim().is_empty() {
        (false, None)
    } else {
        match super::dispositivos::imprimir_ticket(&conn, &impresora, &ticket) {
            Ok(_) => {
                let _ = db::log_event(
                    &conn,
                    "print_ok",
                    Some(user.id),
                    &format!("Factura #{venta_id} impresa en {impresora}"),
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
                (false, Some(e))
            }
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

/// Divide un texto en líneas de `ancho` caracteres como máximo, cortando por
/// palabras y partiendo solo las palabras que por sí solas no caben.
fn envolver(texto: &str, ancho: usize) -> Vec<String> {
    let ancho = ancho.max(1);
    let mut lineas: Vec<String> = Vec::new();
    let mut actual = String::new();
    for palabra in texto.split_whitespace() {
        let largo_actual = actual.chars().count();
        let largo_palabra = palabra.chars().count();
        if actual.is_empty() {
            actual.push_str(palabra);
        } else if largo_actual + 1 + largo_palabra <= ancho {
            actual.push(' ');
            actual.push_str(palabra);
        } else {
            lineas.push(std::mem::take(&mut actual));
            actual.push_str(palabra);
        }
    }
    if !actual.is_empty() {
        lineas.push(actual);
    }
    let mut salida: Vec<String> = Vec::new();
    for linea in lineas {
        let mut resto = linea.as_str();
        while resto.chars().count() > ancho {
            let corte = resto
                .char_indices()
                .nth(ancho)
                .map(|(i, _)| i)
                .unwrap_or(resto.len());
            salida.push(resto[..corte].to_string());
            resto = resto[corte..].trim_start();
        }
        salida.push(resto.to_string());
    }
    if salida.is_empty() {
        salida.push(String::new());
    }
    salida
}

fn centrar(texto: &str, ancho: usize) -> String {
    let texto = texto.trim();
    let largo = texto.chars().count();
    if largo >= ancho {
        return truncate(texto, ancho);
    }
    format!("{}{}", " ".repeat((ancho - largo) / 2), texto)
}

fn monto_ticket(n: f64) -> String {
    db::money(n).trim_start_matches("L ").to_string()
}

fn fecha_ticket(fecha: &str) -> String {
    let mut partes = fecha.splitn(2, ' ');
    let dia = partes.next().unwrap_or("");
    let hora = partes.next().unwrap_or("");
    let f: Vec<&str> = dia.split('-').collect();
    if f.len() == 3 {
        format!("{}/{}/{} {}", f[2], f[1], f[0], hora)
    } else {
        fecha.to_string()
    }
}

fn build_ticket(
    cfg: &ConfigApp,
    id: i64,
    fecha: &str,
    cajero: &str,
    cliente: Option<&str>,
    lineas: &[(i64, String, f64)],
    subtotal: f64,
    descuento: f64,
    total: f64,
    metodo: &str,
    recibido: f64,
    cambio: f64,
) -> String {
    let ver = |valor: &str| valor == "1";
    let ancho: usize = if cfg.ticket_ancho == "80" { 48 } else { 32 };
    let total_w = if ancho >= 48 { 12 } else { 9 };
    let desc_w = ancho.saturating_sub(total_w + 1);
    let label_w = ancho.saturating_sub(total_w);
    let sep = "-".repeat(ancho);
    let sep_fuerte = "=".repeat(ancho);
    let mut t = String::new();

    t.push_str(&centrar(&cfg.negocio_nombre, ancho));
    t.push('\n');
    if ver(&cfg.ticket_mostrar_direccion) && !cfg.negocio_direccion.trim().is_empty() {
        for linea in cfg.negocio_direccion.lines() {
            t.push_str(&centrar(linea, ancho));
            t.push('\n');
        }
    }
    for linea in cfg.ticket_encabezado.lines() {
        if !linea.trim().is_empty() {
            t.push_str(&centrar(linea, ancho));
            t.push('\n');
        }
    }
    t.push_str(&sep);
    t.push('\n');
    t.push_str(&format!("Factura #{id}\n"));
    if ver(&cfg.ticket_mostrar_fecha) {
        t.push_str(&fecha_ticket(fecha));
        t.push('\n');
    }
    if ver(&cfg.ticket_mostrar_cajero) {
        let ancho_texto = ancho.saturating_sub("Cajero: ".len());
        t.push_str(&format!("Cajero: {}\n", truncate(cajero, ancho_texto)));
    }
    if ver(&cfg.ticket_mostrar_cliente) {
        if let Some(c) = cliente {
            let ancho_texto = ancho.saturating_sub("Cliente: ".len());
            t.push_str(&format!("Cliente: {}\n", truncate(c, ancho_texto)));
        }
    }
    t.push_str(&sep);
    t.push('\n');

    let encabezado = format!("{:<desc_w$} {:>total_w$}", "DESCRIPCION", "TOTAL");
    t.push_str(encabezado.trim_end());
    t.push('\n');
    for (cant, nombre, importe) in lineas {
        let mut partes = envolver(&format!("{cant} x {nombre}"), desc_w);
        let primera = partes.remove(0);
        let fila = format!("{:<desc_w$} {:>total_w$}", primera, monto_ticket(*importe));
        t.push_str(fila.trim_end());
        t.push('\n');
        for parte in partes {
            t.push_str(&parte);
            t.push('\n');
        }
    }
    t.push_str(&sep);
    t.push('\n');
    t.push_str(&format!(
        "{:<label_w$}{:>total_w$}\n",
        "SUBTOTAL",
        monto_ticket(subtotal)
    ));
    if descuento > 0.0 {
        t.push_str(&format!(
            "{:<label_w$}{:>total_w$}\n",
            "DESCUENTO",
            monto_ticket(descuento)
        ));
    }
    t.push_str(&sep_fuerte);
    t.push('\n');
    t.push_str(&format!(
        "{:<label_w$}{:>total_w$}\n",
        "TOTAL",
        monto_ticket(total)
    ));
    t.push_str(&sep_fuerte);
    t.push('\n');
    if ver(&cfg.ticket_mostrar_pago) {
        t.push_str(&format!("Pago: {metodo}\n"));
    }
    if ver(&cfg.ticket_mostrar_recibido) && metodo == "efectivo" {
        t.push_str(&format!(
            "{:<label_w$}{:>total_w$}\n",
            "Recibido",
            monto_ticket(recibido)
        ));
        t.push_str(&format!(
            "{:<label_w$}{:>total_w$}\n",
            "Cambio",
            monto_ticket(cambio)
        ));
    }
    t.push_str(&sep);
    t.push('\n');
    for linea in cfg.ticket_pie.lines() {
        t.push_str(&centrar(linea, ancho));
        t.push('\n');
    }
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
                    (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id), c.nombre
             FROM ventas v
             JOIN usuarios u ON u.id = v.usuario_id
             LEFT JOIN clientes c ON c.id = v.cliente_id
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
