use crate::commands::auth::require_roles;
use crate::db::{self, PRODUCTO_SELECT};
use crate::models::{
    DashboardData, DiaVenta, Producto, ReporteVentas, ResumenVentas, TotalesGrupo,
    VentaListado,
};
use crate::AppState;
use rusqlite::params;
use tauri::State;

fn venta_row(r: &rusqlite::Row) -> rusqlite::Result<VentaListado> {
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
pub fn dashboard(state: State<AppState>) -> Result<DashboardData, String> {
    let user = require_roles(&state, &["admin", "caja", "bodega"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let show_sales = user.rol != "bodega";

    let ventas_hoy: f64 = if show_sales {
        conn.query_row(
            "SELECT COALESCE(SUM(total),0) FROM ventas
             WHERE estado = 'completada' AND date(fecha) = date('now','localtime')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0)
    } else {
        0.0
    };
    let ventas_semana: f64 = if show_sales {
        conn.query_row(
            "SELECT COALESCE(SUM(total),0) FROM ventas
             WHERE estado = 'completada' AND datetime(fecha) >= datetime('now','localtime','-7 days')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0.0)
    } else {
        0.0
    };
    let tickets_hoy: i64 = if show_sales {
        conn.query_row(
            "SELECT COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) = date('now','localtime')",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0)
    } else {
        0
    };
    let ticket_promedio = if tickets_hoy > 0 {
        db::round2(ventas_hoy / tickets_hoy as f64)
    } else {
        0.0
    };
    let stock_bajo: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM productos WHERE activo = 1 AND stock <= stock_minimo",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let mut ultimas = Vec::new();
    if show_sales {
        let mut stmt = conn
            .prepare(
                "SELECT v.id, v.fecha, u.nombre, v.total, v.descuento, v.metodo_pago, v.estado,
                        (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id), c.nombre
                 FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
                 LEFT JOIN clientes c ON c.id = v.cliente_id
                 ORDER BY v.id DESC LIMIT 8",
            )
            .map_err(|e| e.to_string())?;
        ultimas = stmt
            .query_map([], venta_row)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    }

    let sql = format!(
        "{PRODUCTO_SELECT} WHERE p.activo = 1
         ORDER BY CASE WHEN p.stock <= p.stock_minimo THEN 0 ELSE 1 END,
                  p.stock ASC, p.nombre ASC
         LIMIT 8"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let show_cost = user.rol == "admin";
    let productos_alerta = stmt
        .query_map([], |r| db::map_producto(r, show_cost))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<Producto>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(DashboardData {
        ventas_hoy,
        ventas_semana,
        tickets_hoy,
        ticket_promedio,
        stock_bajo,
        ultimas_ventas: ultimas,
        productos_alerta,
    })
}

#[tauri::command]
pub fn reporte_ventas(
    state: State<AppState>,
    periodo: String,
    desde: Option<String>,
    hasta: Option<String>,
) -> Result<ReporteVentas, String> {
    require_roles(&state, &["admin"])?;
    let (d, h) = match periodo.as_str() {
        "dia" => {
            let t = chrono::Local::now().format("%Y-%m-%d").to_string();
            (t.clone(), t)
        }
        "semana" => {
            let h = chrono::Local::now().format("%Y-%m-%d").to_string();
            let d = (chrono::Local::now() - chrono::Duration::days(6))
                .format("%Y-%m-%d")
                .to_string();
            (d, h)
        }
        "mes" => {
            let now = chrono::Local::now();
            let d = now.format("%Y-%m-01").to_string();
            let h = now.format("%Y-%m-%d").to_string();
            (d, h)
        }
        _ => (
            desde.unwrap_or_else(|| "2000-01-01".into()),
            hasta.unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string()),
        ),
    };

    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let (total, cantidad): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total),0), COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)",
            params![d, h],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let ticket_promedio = if cantidad > 0 {
        db::round2(total / cantidad as f64)
    } else {
        0.0
    };

    let mut stmt = conn
        .prepare(
            "SELECT metodo_pago, SUM(total), COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)
             GROUP BY metodo_pago",
        )
        .map_err(|e| e.to_string())?;
    let por_metodo = stmt
        .query_map(params![d, h], |r| {
            Ok(TotalesGrupo {
                nombre: r.get(0)?,
                total: r.get(1)?,
                cantidad: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT u.nombre, SUM(v.total), COUNT(*) FROM ventas v
             JOIN usuarios u ON u.id = v.usuario_id
             WHERE v.estado = 'completada' AND date(v.fecha) >= date(?1) AND date(v.fecha) <= date(?2)
             GROUP BY u.id ORDER BY SUM(v.total) DESC",
        )
        .map_err(|e| e.to_string())?;
    let por_usuario = stmt
        .query_map(params![d, h], |r| {
            Ok(TotalesGrupo {
                nombre: r.get(0)?,
                total: r.get(1)?,
                cantidad: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT s.nombre, SUM((i.cantidad * i.precio_unitario) - i.descuento), SUM(i.cantidad)
             FROM venta_items i
             JOIN ventas v ON v.id = i.venta_id
             JOIN servicios s ON s.id = i.referencia_id
             WHERE i.tipo = 'servicio' AND v.estado = 'completada'
               AND date(v.fecha) >= date(?1) AND date(v.fecha) <= date(?2)
             GROUP BY s.id ORDER BY SUM(i.cantidad) DESC LIMIT 8",
        )
        .map_err(|e| e.to_string())?;
    let servicios_top = stmt
        .query_map(params![d, h], |r| {
            Ok(TotalesGrupo {
                nombre: r.get(0)?,
                total: r.get(1)?,
                cantidad: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT v.id, v.fecha, u.nombre, v.total, v.descuento, v.metodo_pago, v.estado,
                    (SELECT COUNT(*) FROM venta_items i WHERE i.venta_id = v.id), c.nombre
             FROM ventas v JOIN usuarios u ON u.id = v.usuario_id
             LEFT JOIN clientes c ON c.id = v.cliente_id
             WHERE date(v.fecha) >= date(?1) AND date(v.fecha) <= date(?2)
             ORDER BY v.id DESC LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let ventas = stmt
        .query_map(params![d, h], venta_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ReporteVentas {
        total,
        cantidad,
        ticket_promedio,
        por_metodo,
        por_usuario,
        servicios_top,
        ventas,
    })
}

#[tauri::command]
pub fn resumen_ventas(
    state: State<AppState>,
    desde: String,
    hasta: String,
) -> Result<ResumenVentas, String> {
    require_roles(&state, &["admin", "caja"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let (total, cantidad): (f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(total),0), COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)",
            params![desde, hasta],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let ticket_promedio = if cantidad > 0 {
        db::round2(total / cantidad as f64)
    } else {
        0.0
    };

    let mut stmt = conn
        .prepare(
            "SELECT metodo_pago, SUM(total), COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)
             GROUP BY metodo_pago ORDER BY SUM(total) DESC",
        )
        .map_err(|e| e.to_string())?;
    let por_metodo = stmt
        .query_map(params![desde, hasta], |r| {
            Ok(TotalesGrupo {
                nombre: r.get(0)?,
                total: r.get(1)?,
                cantidad: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT substr(fecha, 1, 10) AS dia, SUM(total), COUNT(*) FROM ventas
             WHERE estado = 'completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)
             GROUP BY dia ORDER BY dia ASC",
        )
        .map_err(|e| e.to_string())?;
    let serie = stmt
        .query_map(params![desde, hasta], |r| {
            Ok(DiaVenta {
                fecha: r.get(0)?,
                total: r.get(1)?,
                cantidad: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ResumenVentas {
        total,
        cantidad,
        ticket_promedio,
        por_metodo,
        serie,
    })
}

#[tauri::command]
pub fn productos_stock_minimo(state: State<AppState>) -> Result<Vec<Producto>, String> {
    let user = require_roles(&state, &["admin", "bodega"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let sql = format!(
        "{PRODUCTO_SELECT} WHERE p.activo = 1 AND p.stock <= p.stock_minimo ORDER BY p.stock ASC"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| db::map_producto(r, user.rol == "admin"))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}
