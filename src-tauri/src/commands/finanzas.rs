use crate::commands::auth::require_modulo;
use crate::db;
use crate::models::{
    CompraInventario, DiaFinanza, Gasto, GastoIn, ResumenFinanzas, TotalesGrupo,
};
use crate::AppState;
use chrono::NaiveDate;
use rusqlite::params;
use std::collections::BTreeMap;
use tauri::State;

const MODULO: &str = "/finanzas";

const CATEGORIAS: &[&str] = &[
    "Renta",
    "Sueldos",
    "Servicios",
    "Transporte",
    "Publicidad",
    "Impuestos",
    "Mantenimiento",
    "Otros",
];

fn fecha_valida(s: &str) -> Result<String, String> {
    let corta = s.trim().chars().take(10).collect::<String>();
    NaiveDate::parse_from_str(&corta, "%Y-%m-%d")
        .map(|_| corta)
        .map_err(|_| "La fecha no es válida.".into())
}

fn gasto_row(r: &rusqlite::Row) -> rusqlite::Result<Gasto> {
    Ok(Gasto {
        id: r.get(0)?,
        fecha: r.get(1)?,
        categoria: r.get(2)?,
        descripcion: r.get(3)?,
        monto: r.get(4)?,
        metodo_pago: r.get(5)?,
        proveedor_id: r.get(6)?,
        proveedor_nombre: r.get(7)?,
        usuario_nombre: r.get(8)?,
        created_at: r.get(9)?,
    })
}

const GASTO_SELECT: &str = "
    SELECT g.id, g.fecha, g.categoria, g.descripcion, g.monto, g.metodo_pago,
           g.proveedor_id, pr.nombre, COALESCE(u.nombre, ''), g.created_at
    FROM gastos g
    LEFT JOIN proveedores pr ON pr.id = g.proveedor_id
    LEFT JOIN usuarios u ON u.id = g.usuario_id
";

#[tauri::command]
pub fn listar_gastos(
    state: State<AppState>,
    desde: Option<String>,
    hasta: Option<String>,
    categoria: Option<String>,
) -> Result<Vec<Gasto>, String> {
    require_modulo(&state, MODULO, None)?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let mut sql = String::from(GASTO_SELECT);
    let mut condiciones: Vec<String> = Vec::new();
    let d = desde
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let h = hasta
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    let c = categoria
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if !d.is_empty() {
        condiciones.push("date(g.fecha) >= date(?1)".into());
    }
    if !h.is_empty() {
        condiciones.push("date(g.fecha) <= date(?2)".into());
    }
    if !c.is_empty() {
        condiciones.push("g.categoria = ?3".into());
    }
    if !condiciones.is_empty() {
        sql.push_str(" WHERE ");
        sql.push_str(&condiciones.join(" AND "));
    }
    sql.push_str(" ORDER BY g.fecha DESC, g.id DESC");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![d, h, c], gasto_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn guardar_gasto(state: State<AppState>, data: GastoIn) -> Result<i64, String> {
    let es_nuevo = data.id.is_none();
    let user = require_modulo(
        &state,
        MODULO,
        Some(if es_nuevo { "crear" } else { "editar" }),
    )?;

    let fecha = fecha_valida(&data.fecha)?;
    let categoria = data.categoria.trim();
    if !CATEGORIAS.iter().any(|c| *c == categoria) {
        return Err("Categoría no válida.".into());
    }
    let monto = db::round2(data.monto);
    if monto <= 0.0 {
        return Err("El monto debe ser mayor a cero.".into());
    }
    let metodo_pago = if data.metodo_pago.trim().is_empty() {
        "efectivo".to_string()
    } else {
        data.metodo_pago.trim().to_string()
    };

    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let ts = db::now();
    let id = if let Some(id) = data.id {
        let n = conn
            .execute(
                "UPDATE gastos SET fecha=?1, categoria=?2, descripcion=?3, monto=?4,
                        metodo_pago=?5, proveedor_id=?6 WHERE id=?7",
                params![
                    fecha,
                    categoria,
                    data.descripcion.trim(),
                    monto,
                    metodo_pago,
                    data.proveedor_id,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("El gasto ya no existe.".into());
        }
        id
    } else {
        conn.execute(
            "INSERT INTO gastos (fecha, categoria, descripcion, monto, metodo_pago,
                                 proveedor_id, usuario_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                fecha,
                categoria,
                data.descripcion.trim(),
                monto,
                metodo_pago,
                data.proveedor_id,
                user.id,
                ts
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    let _ = db::log_event(
        &conn,
        "gasto",
        Some(user.id),
        &format!("Gasto {} por {}", if es_nuevo { "registrado" } else { "editado" }, db::money(monto)),
        None,
    );
    Ok(id)
}

#[tauri::command]
pub fn eliminar_gasto(state: State<AppState>, gasto_id: i64) -> Result<(), String> {
    let user = require_modulo(&state, MODULO, Some("eliminar"))?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let n = conn
        .execute("DELETE FROM gastos WHERE id = ?1", params![gasto_id])
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("El gasto ya no existe.".into());
    }
    let _ = db::log_event(
        &conn,
        "gasto",
        Some(user.id),
        &format!("Gasto #{gasto_id} eliminado"),
        None,
    );
    Ok(())
}

#[tauri::command]
pub fn resumen_finanzas(
    state: State<AppState>,
    desde: String,
    hasta: String,
) -> Result<ResumenFinanzas, String> {
    require_modulo(&state, MODULO, None)?;
    let d = desde.trim();
    let h = hasta.trim();

    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;

    let ingresos: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(total),0) FROM ventas
             WHERE estado='completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)",
            params![d, h],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let por_categoria: Vec<TotalesGrupo> = {
        let mut stmt = conn
            .prepare(
                "SELECT categoria, COALESCE(SUM(monto),0), COUNT(*) FROM gastos
                 WHERE date(fecha) >= date(?1) AND date(fecha) <= date(?2)
                 GROUP BY categoria ORDER BY SUM(monto) DESC",
            )
            .map_err(|e| e.to_string())?;
        let filas = stmt
            .query_map(params![d, h], |r| {
                Ok(TotalesGrupo {
                    nombre: r.get(0)?,
                    total: db::round2(r.get::<_, f64>(1)?),
                    cantidad: r.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        filas
    };
    let gastos_manuales: f64 = por_categoria.iter().map(|g| g.total).sum();

    // Compras de inventario derivadas de las entradas de stock: cantidad × costo
    // del producto. No se suma el costo de lo vendido para no contar dos veces
    // la misma mercadería: aquí se contabiliza cuando entra al inventario.
    let compras: Vec<CompraInventario> = {
        let mut stmt = conn
            .prepare(
                "SELECT m.id, date(m.fecha), m.producto_id, p.nombre, m.cantidad,
                        COALESCE(p.costo,0), m.cantidad * COALESCE(p.costo,0), m.motivo
                 FROM movimientos_inv m JOIN productos p ON p.id = m.producto_id
                 WHERE m.tipo='entrada' AND date(m.fecha) >= date(?1) AND date(m.fecha) <= date(?2)
                 ORDER BY m.fecha DESC, m.id DESC",
            )
            .map_err(|e| e.to_string())?;
        let filas = stmt
            .query_map(params![d, h], |r| {
                Ok(CompraInventario {
                    id: r.get(0)?,
                    fecha: r.get(1)?,
                    producto_id: r.get(2)?,
                    producto_nombre: r.get(3)?,
                    cantidad: r.get(4)?,
                    costo_unitario: db::round2(r.get::<_, f64>(5)?),
                    total: db::round2(r.get::<_, f64>(6)?),
                    motivo: r.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        filas
    };
    let compras_inventario: f64 = compras.iter().map(|c| c.total).sum();

    // Serie diaria: ingresos por ventas y egresos por gastos + compras.
    let mut dias: BTreeMap<String, (f64, f64)> = BTreeMap::new();
    {
        let mut stmt = conn
            .prepare(
                "SELECT date(fecha), COALESCE(SUM(total),0) FROM ventas
                 WHERE estado='completada' AND date(fecha) >= date(?1) AND date(fecha) <= date(?2)
                 GROUP BY date(fecha)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![d, h], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (fecha, total) in rows {
            let e = dias.entry(fecha).or_insert((0.0, 0.0));
            e.0 += total;
        }
    }
    {
        let mut stmt = conn
            .prepare(
                "SELECT date(fecha), COALESCE(SUM(monto),0) FROM gastos
                 WHERE date(fecha) >= date(?1) AND date(fecha) <= date(?2)
                 GROUP BY date(fecha)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![d, h], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (fecha, total) in rows {
            let e = dias.entry(fecha).or_insert((0.0, 0.0));
            e.1 += total;
        }
    }
    {
        let mut stmt = conn
            .prepare(
                "SELECT date(m.fecha), SUM(m.cantidad * COALESCE(p.costo,0))
                 FROM movimientos_inv m JOIN productos p ON p.id = m.producto_id
                 WHERE m.tipo='entrada' AND date(m.fecha) >= date(?1) AND date(m.fecha) <= date(?2)
                 GROUP BY date(m.fecha)",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![d, h], |r| Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        for (fecha, total) in rows {
            let e = dias.entry(fecha).or_insert((0.0, 0.0));
            e.1 += total;
        }
    }

    let serie: Vec<DiaFinanza> = dias
        .into_iter()
        .map(|(fecha, (ing, gas))| DiaFinanza {
            fecha,
            ingresos: db::round2(ing),
            gastos: db::round2(gas),
            utilidad: db::round2(ing - gas),
        })
        .collect();

    let gastos_totales = db::round2(gastos_manuales + compras_inventario);
    let utilidad_neta = db::round2(ingresos - gastos_totales);

    let mut stmt = conn
        .prepare(&format!("{GASTO_SELECT} WHERE date(g.fecha) >= date(?1) AND date(g.fecha) <= date(?2) ORDER BY g.fecha DESC, g.id DESC"))
        .map_err(|e| e.to_string())?;
    let gastos = stmt
        .query_map(params![d, h], gasto_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ResumenFinanzas {
        desde: d.to_string(),
        hasta: h.to_string(),
        ingresos: db::round2(ingresos),
        gastos_manuales: db::round2(gastos_manuales),
        compras_inventario: db::round2(compras_inventario),
        gastos_totales,
        utilidad_neta,
        por_categoria,
        serie,
        gastos,
        compras,
    })
}
