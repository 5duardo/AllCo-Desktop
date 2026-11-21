use crate::models::{ConfigApp, Producto, UsuarioPublico};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;

pub const BCRYPT_COST: u32 = 10;

pub fn now() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn open(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn migrate_and_seed(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            usuario TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            rol TEXT NOT NULL CHECK (rol IN ('admin','bodega','caja')),
            activo INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proveedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            contacto TEXT NOT NULL DEFAULT '',
            telefono TEXT NOT NULL DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS sucursales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            direccion TEXT NOT NULL DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS productos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sku TEXT NOT NULL DEFAULT '',
            codigo_barras TEXT NOT NULL DEFAULT '',
            nombre TEXT NOT NULL,
            marca TEXT NOT NULL DEFAULT '',
            medida TEXT NOT NULL DEFAULT '',
            modelo TEXT NOT NULL DEFAULT '',
            dot TEXT NOT NULL DEFAULT '',
            proveedor_id INTEGER REFERENCES proveedores(id),
            costo REAL NOT NULL DEFAULT 0,
            precio_venta REAL NOT NULL DEFAULT 0,
            stock INTEGER NOT NULL DEFAULT 0,
            stock_minimo INTEGER NOT NULL DEFAULT 2,
            sucursal_id INTEGER REFERENCES sucursales(id),
            activo INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_barcode
            ON productos(codigo_barras)
            WHERE activo = 1 AND codigo_barras IS NOT NULL AND codigo_barras != '';
        CREATE TABLE IF NOT EXISTS servicios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            descripcion TEXT NOT NULL DEFAULT '',
            precio REAL NOT NULL DEFAULT 0,
            duracion_min INTEGER NOT NULL DEFAULT 0,
            activo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS movimientos_inv (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto_id INTEGER NOT NULL REFERENCES productos(id),
            tipo TEXT NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
            cantidad INTEGER NOT NULL,
            motivo TEXT NOT NULL DEFAULT '',
            usuario_id INTEGER REFERENCES usuarios(id),
            venta_id INTEGER,
            fecha TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
            sucursal_id INTEGER REFERENCES sucursales(id),
            total REAL NOT NULL,
            descuento REAL NOT NULL DEFAULT 0,
            metodo_pago TEXT NOT NULL,
            estado TEXT NOT NULL DEFAULT 'completada',
            motivo_anulacion TEXT
        );
        CREATE TABLE IF NOT EXISTS venta_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            venta_id INTEGER NOT NULL REFERENCES ventas(id),
            tipo TEXT NOT NULL CHECK (tipo IN ('producto','servicio')),
            referencia_id INTEGER NOT NULL,
            cantidad INTEGER NOT NULL,
            precio_unitario REAL NOT NULL,
            descuento REAL NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sesiones (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
            inicio TEXT NOT NULL,
            fin TEXT,
            exito INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS eventos_sistema (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            usuario_id INTEGER,
            mensaje TEXT NOT NULL DEFAULT '',
            payload_json TEXT,
            fecha TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS configuracion (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS respaldos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL CHECK (tipo IN ('local','remoto')),
            ruta_o_key TEXT NOT NULL,
            tamano_bytes INTEGER NOT NULL DEFAULT 0,
            exito INTEGER NOT NULL DEFAULT 1,
            mensaje_error TEXT,
            fecha TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    // Renombra los valores por defecto antiguos sin tocar nombres personalizados.
    conn.execute(
        "UPDATE configuracion SET valor = 'AllCo'
         WHERE clave = 'negocio_nombre' AND valor = 'Llantera y Car Wash El Centro'",
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE configuracion SET valor = 'allco.online'
         WHERE clave = 'negocio_direccion' AND valor = 'Honduras'",
        [],
    )
    .map_err(|e| e.to_string())?;

    seed(conn)
}

fn seed(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let ts = now();
    let admin_hash =
        bcrypt::hash("admin123", BCRYPT_COST).map_err(|e| e.to_string())?;
    let caja_hash = bcrypt::hash("caja123", BCRYPT_COST).map_err(|e| e.to_string())?;
    let bodega_hash =
        bcrypt::hash("bodega123", BCRYPT_COST).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, created_at)
         VALUES (?1,?2,?3,'admin',1,?4), (?5,?6,?7,'caja',1,?4), (?8,?9,?10,'bodega',1,?4)",
        params![
            "Administrador",
            "admin",
            admin_hash,
            ts,
            "Cajero",
            "caja",
            caja_hash,
            "Bodega",
            "bodega",
            bodega_hash
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO sucursales (nombre, direccion, activo) VALUES (?1, ?2, 1)",
        params!["El Centro", "Honduras"],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO proveedores (nombre, contacto, telefono, activo)
         VALUES ('Proveedor general', '', '', 1)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES
            ('negocio_nombre', 'AllCo'),
            ('negocio_direccion', 'allco.online'),
            ('ticket_pie', '¡Gracias por su preferencia!'),
            ('umbral_db_mb', '500'),
            ('umbral_respaldo_dias', '7'),
            ('caja_puede_descuento', '0')",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO servicios (nombre, descripcion, precio, duracion_min, activo) VALUES
            ('Lavado básico', 'Lavado exterior con shampoo', 150, 20, 1),
            ('Lavado + encerado', 'Lavado exterior y cera', 250, 40, 1),
            ('Combo premium', 'Lavado, motor, cera y aspirado', 400, 60, 1),
            ('Lavado de motor', 'Desengrasado de motor', 200, 30, 1)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO productos
            (sku, codigo_barras, nombre, marca, medida, modelo, dot, proveedor_id,
             costo, precio_venta, stock, stock_minimo, sucursal_id, activo, created_at, updated_at)
         VALUES
            ('LL-001','7501234567890','Llanta Primacy 4','Michelin','205/55R16','Primacy 4','2424',1,1800,2400,8,3,1,1,?1,?1),
            ('LL-002','7501234567891','Llanta Turanza','Bridgestone','185/65R15','Turanza','2324',1,1400,1900,5,2,1,1,?1,?1),
            ('LL-003','7501234567892','Llanta Assurance','Goodyear','195/65R15','Assurance','2524',1,1300,1750,2,2,1,1,?1,?1),
            ('LL-004','7501234567893','Llanta P Zero','Pirelli','225/45R17','P Zero','2425',1,2500,3400,1,2,1,1,?1,?1)",
        params![ts],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub fn log_event(
    conn: &Connection,
    tipo: &str,
    usuario_id: Option<i64>,
    mensaje: &str,
    payload: Option<&str>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO eventos_sistema (tipo, usuario_id, mensaje, payload_json, fecha)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![tipo, usuario_id, mensaje, payload, now()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn config_map(conn: &Connection) -> Result<ConfigApp, String> {
    let mut stmt = conn
        .prepare("SELECT clave, valor FROM configuracion")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(ConfigApp {
        negocio_nombre: map
            .get("negocio_nombre")
            .cloned()
            .unwrap_or_else(|| "Llantera y Car Wash El Centro".into()),
        negocio_direccion: map
            .get("negocio_direccion")
            .cloned()
            .unwrap_or_else(|| "Honduras".into()),
        ticket_pie: map
            .get("ticket_pie")
            .cloned()
            .unwrap_or_else(|| "¡Gracias por su preferencia!".into()),
        umbral_db_mb: map.get("umbral_db_mb").cloned().unwrap_or_else(|| "500".into()),
        umbral_respaldo_dias: map
            .get("umbral_respaldo_dias")
            .cloned()
            .unwrap_or_else(|| "7".into()),
        caja_puede_descuento: map
            .get("caja_puede_descuento")
            .cloned()
            .unwrap_or_else(|| "0".into()),
    })
}

pub fn save_config(conn: &Connection, cfg: &ConfigApp) -> Result<(), String> {
    let pairs = [
        ("negocio_nombre", cfg.negocio_nombre.as_str()),
        ("negocio_direccion", cfg.negocio_direccion.as_str()),
        ("ticket_pie", cfg.ticket_pie.as_str()),
        ("umbral_db_mb", cfg.umbral_db_mb.as_str()),
        ("umbral_respaldo_dias", cfg.umbral_respaldo_dias.as_str()),
        ("caja_puede_descuento", cfg.caja_puede_descuento.as_str()),
    ];
    for (k, v) in pairs {
        conn.execute(
            "INSERT INTO configuracion (clave, valor) VALUES (?1, ?2)
             ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
            params![k, v],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn round2(n: f64) -> f64 {
    (n * 100.0).round() / 100.0
}

pub fn money(n: f64) -> String {
    format!("L {n:.2}")
}

pub fn map_producto(r: &rusqlite::Row, show_cost: bool) -> rusqlite::Result<Producto> {
    Ok(Producto {
        id: r.get(0)?,
        sku: r.get(1)?,
        codigo_barras: r.get(2)?,
        nombre: r.get(3)?,
        marca: r.get(4)?,
        medida: r.get(5)?,
        modelo: r.get(6)?,
        dot: r.get(7)?,
        proveedor_id: r.get(8)?,
        proveedor_nombre: r.get(9)?,
        costo: if show_cost { Some(r.get(10)?) } else { None },
        precio_venta: r.get(11)?,
        stock: r.get(12)?,
        stock_minimo: r.get(13)?,
        sucursal_id: r.get(14)?,
        sucursal_nombre: r.get(15)?,
        activo: r.get::<_, i64>(16)? != 0,
    })
}

pub const PRODUCTO_SELECT: &str = "
    SELECT p.id, p.sku, p.codigo_barras, p.nombre, p.marca, p.medida, p.modelo, p.dot,
           p.proveedor_id, pr.nombre, p.costo, p.precio_venta, p.stock, p.stock_minimo,
           p.sucursal_id, s.nombre, p.activo
    FROM productos p
    LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
    LEFT JOIN sucursales s ON s.id = p.sucursal_id
";

pub fn usuario_from_row(r: &rusqlite::Row) -> rusqlite::Result<UsuarioPublico> {
    Ok(UsuarioPublico {
        id: r.get(0)?,
        nombre: r.get(1)?,
        usuario: r.get(2)?,
        rol: r.get(3)?,
        activo: r.get::<_, i64>(4)? != 0,
    })
}

pub fn count_query(conn: &Connection, sql: &str) -> Result<i64, String> {
    conn.query_row(sql, [], |r| r.get(0))
        .map_err(|e| e.to_string())
}

pub fn last_evento(
    conn: &Connection,
    tipo_like: &str,
) -> Result<Option<(String, String, String)>, String> {
    conn.query_row(
        "SELECT tipo, mensaje, fecha FROM eventos_sistema
         WHERE tipo LIKE ?1 ORDER BY id DESC LIMIT 1",
        params![tipo_like],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
    )
    .optional()
    .map_err(|e| e.to_string())
}
