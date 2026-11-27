use crate::models::{ConfigApp, Licencia, MarcaNegocio, Producto, UsuarioPublico};
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
            es_dev INTEGER NOT NULL DEFAULT 0,
            intentos_fallidos INTEGER NOT NULL DEFAULT 0,
            bloqueado_hasta TEXT,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proveedores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            contacto TEXT NOT NULL DEFAULT '',
            telefono TEXT NOT NULL DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS empleados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            puesto TEXT NOT NULL DEFAULT '',
            telefono TEXT NOT NULL DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS usuario_permisos (
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            modulo TEXT NOT NULL,
            PRIMARY KEY (usuario_id, modulo)
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
            imagen TEXT,
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
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL,
            telefono TEXT NOT NULL DEFAULT '',
            correo TEXT NOT NULL DEFAULT '',
            direccion TEXT NOT NULL DEFAULT '',
            activo INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS ventas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
            sucursal_id INTEGER REFERENCES sucursales(id),
            cliente_id INTEGER REFERENCES clientes(id),
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
        CREATE TABLE IF NOT EXISTS gastos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fecha TEXT NOT NULL,
            categoria TEXT NOT NULL,
            descripcion TEXT NOT NULL DEFAULT '',
            monto REAL NOT NULL,
            metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
            proveedor_id INTEGER REFERENCES proveedores(id),
            usuario_id INTEGER REFERENCES usuarios(id),
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
        CREATE TABLE IF NOT EXISTS favoritos_dispositivo (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL CHECK (tipo IN ('impresora','dispositivo')),
            nombre TEXT NOT NULL,
            clase TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE (tipo, nombre)
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    // Agrega cliente_id a bases de datos creadas antes de existir clientes.
    let tiene_cliente_id = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(ventas)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut encontrado = false;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let nombre: String = row.get(1).map_err(|e| e.to_string())?;
            if nombre == "cliente_id" {
                encontrado = true;
                break;
            }
        }
        encontrado
    };
    if !tiene_cliente_id {
        conn.execute(
            "ALTER TABLE ventas ADD COLUMN cliente_id INTEGER REFERENCES clientes(id)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // Agrega la marca de desarrollador a bases de datos existentes.
    let tiene_es_dev = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(usuarios)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut encontrado = false;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let nombre: String = row.get(1).map_err(|e| e.to_string())?;
            if nombre == "es_dev" {
                encontrado = true;
                break;
            }
        }
        encontrado
    };
    if !tiene_es_dev {
        conn.execute(
            "ALTER TABLE usuarios ADD COLUMN es_dev INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    // Control de intentos fallidos de inicio de sesión.
    let columnas_usuarios: Vec<String> = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(usuarios)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut nombres = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            nombres.push(row.get::<_, String>(1).map_err(|e| e.to_string())?);
        }
        nombres
    };
    if !columnas_usuarios.iter().any(|c| c == "intentos_fallidos") {
        conn.execute(
            "ALTER TABLE usuarios ADD COLUMN intentos_fallidos INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !columnas_usuarios.iter().any(|c| c == "bloqueado_hasta") {
        conn.execute("ALTER TABLE usuarios ADD COLUMN bloqueado_hasta TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    // Agrega la imagen del producto a bases de datos existentes.
    let tiene_imagen = {
        let mut stmt = conn
            .prepare("PRAGMA table_info(productos)")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
        let mut encontrado = false;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let nombre: String = row.get(1).map_err(|e| e.to_string())?;
            if nombre == "imagen" {
                encontrado = true;
                break;
            }
        }
        encontrado
    };
    if !tiene_imagen {
        conn.execute("ALTER TABLE productos ADD COLUMN imagen TEXT", [])
            .map_err(|e| e.to_string())?;
    }

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

    // La sucursal por defecto se llama Principal (antes "El Centro").
    conn.execute(
        "UPDATE sucursales SET nombre = 'Principal'
         WHERE nombre = 'El Centro'
           AND NOT EXISTS (SELECT 1 FROM sucursales s2 WHERE s2.nombre = 'Principal')",
        [],
    )
    .map_err(|e| e.to_string())?;

    seed(conn)?;
    ensure_dev_user(conn)?;
    migrate_default_password(conn)?;
    ensure_nuevas_claves_config(conn)
}

/// El inicio automático viene activado en instalaciones nuevas y antiguas.
fn ensure_nuevas_claves_config(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('iniciar_al_encender', '1')
         ON CONFLICT(clave) DO NOTHING",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// `None` significa que el usuario no tiene permisos personalizados y usa su rol.
pub fn permisos_usuario(conn: &Connection, usuario_id: i64) -> Result<Option<Vec<String>>, String> {
    let mut stmt = conn
        .prepare("SELECT modulo FROM usuario_permisos WHERE usuario_id = ?1 ORDER BY modulo")
        .map_err(|e| e.to_string())?;
    let modulos = stmt
        .query_map(params![usuario_id], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|m| m != "_")
        .collect::<Vec<_>>();
    let personalizado: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM usuario_permisos WHERE usuario_id = ?1",
            params![usuario_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if personalizado > 0 {
        Ok(Some(modulos))
    } else {
        Ok(None)
    }
}

pub fn config_flag(conn: &Connection, clave: &str, por_defecto: bool) -> bool {
    conn.query_row(
        "SELECT valor FROM configuracion WHERE clave = ?1",
        params![clave],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .ok()
    .flatten()
    .map(|v| v == "1")
    .unwrap_or(por_defecto)
}

fn ensure_dev_user(conn: &Connection) -> Result<(), String> {
    let existe: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM usuarios WHERE usuario = 'dev'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if existe == 0 {
        let hash = bcrypt::hash("EJBC2005", BCRYPT_COST).map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, es_dev, created_at)
             VALUES ('Desarrollador', 'dev', ?1, 'admin', 1, 1, ?2)",
            params![hash, now()],
        )
        .map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE usuarios SET es_dev = 1 WHERE usuario = 'dev'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Cambia la contraseña por defecto antigua (admin123/caja123/bodega123)
/// a 123456789, solo si el usuario nunca la cambió.
fn migrate_default_password(conn: &Connection) -> Result<(), String> {
    let done: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM configuracion WHERE clave = 'pwd_default_v2'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if done > 0 {
        return Ok(());
    }

    let new_hash = bcrypt::hash("123456789", BCRYPT_COST).map_err(|e| e.to_string())?;
    for (usuario, anterior) in [
        ("admin", "admin123"),
        ("caja", "caja123"),
        ("bodega", "bodega123"),
    ] {
        let hash: Option<String> = conn
            .query_row(
                "SELECT password_hash FROM usuarios WHERE usuario = ?1",
                params![usuario],
                |r| r.get(0),
            )
            .optional()
            .map_err(|e| e.to_string())?;
        if let Some(hash) = hash {
            if bcrypt::verify(anterior, &hash).unwrap_or(false) {
                conn.execute(
                    "UPDATE usuarios SET password_hash = ?1 WHERE usuario = ?2",
                    params![new_hash.as_str(), usuario],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('pwd_default_v2', '1')
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn seed(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM usuarios", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Ok(());
    }

    let ts = now();
    let default_hash =
        bcrypt::hash("123456789", BCRYPT_COST).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO usuarios (nombre, usuario, password_hash, rol, activo, created_at)
         VALUES (?1,?2,?3,'admin',1,?4), (?5,?6,?7,'caja',1,?4), (?8,?9,?10,'bodega',1,?4)",
        params![
            "Administrador",
            "admin",
            default_hash.clone(),
            ts,
            "Cajero",
            "caja",
            default_hash.clone(),
            "Bodega",
            "bodega",
            default_hash
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO sucursales (nombre, direccion, activo) VALUES (?1, ?2, 1)",
        params!["Principal", "Honduras"],
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
            .unwrap_or_else(|| "AllCo".into()),
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
        negocio_logo: map
            .get("negocio_logo")
            .filter(|v| !v.trim().is_empty())
            .cloned(),
        ticket_encabezado: map
            .get("ticket_encabezado")
            .cloned()
            .unwrap_or_default(),
        ticket_mostrar_direccion: map
            .get("ticket_mostrar_direccion")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_fecha: map
            .get("ticket_mostrar_fecha")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_cajero: map
            .get("ticket_mostrar_cajero")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_cliente: map
            .get("ticket_mostrar_cliente")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_pago: map
            .get("ticket_mostrar_pago")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_recibido: map
            .get("ticket_mostrar_recibido")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_mostrar_logo: map
            .get("ticket_mostrar_logo")
            .cloned()
            .unwrap_or_else(|| "1".into()),
        ticket_ancho: map
            .get("ticket_ancho")
            .cloned()
            .unwrap_or_else(|| "58".into()),
        fiscal_rtn: map.get("fiscal_rtn").cloned().unwrap_or_default(),
        fiscal_cai: map.get("fiscal_cai").cloned().unwrap_or_default(),
        fiscal_rango_desde: map.get("fiscal_rango_desde").cloned().unwrap_or_default(),
        fiscal_rango_hasta: map.get("fiscal_rango_hasta").cloned().unwrap_or_default(),
        fiscal_fecha_limite: map.get("fiscal_fecha_limite").cloned().unwrap_or_default(),
        fiscal_isv: map
            .get("fiscal_isv")
            .cloned()
            .unwrap_or_else(|| "15".into()),
        fiscal_precios_con_isv: map
            .get("fiscal_precios_con_isv")
            .cloned()
            .unwrap_or_else(|| "1".into()),
    })
}

pub fn marca_negocio(conn: &Connection) -> Result<MarcaNegocio, String> {
    let cfg = config_map(conn)?;
    Ok(MarcaNegocio {
        mostrar_logo_factura: cfg.ticket_mostrar_logo == "1",
        nombre: cfg.negocio_nombre,
        direccion: cfg.negocio_direccion,
        logo: cfg.negocio_logo,
    })
}

pub fn licencia(conn: &Connection) -> Result<Licencia, String> {
    let mut stmt = conn
        .prepare("SELECT clave, valor FROM configuracion WHERE clave LIKE 'licencia_%'")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (k, v) = row.map_err(|e| e.to_string())?;
        map.insert(k, v);
    }
    Ok(Licencia {
        titular: map.get("licencia_titular").cloned().unwrap_or_default(),
        plan: map.get("licencia_plan").cloned().unwrap_or_default(),
        inicio: map.get("licencia_inicio").cloned().unwrap_or_default(),
        expira: map.get("licencia_expira").cloned().unwrap_or_default(),
        notas: map.get("licencia_notas").cloned().unwrap_or_default(),
    })
}

pub fn save_licencia(conn: &Connection, lic: &Licencia) -> Result<(), String> {
    let pairs = [
        ("licencia_titular", lic.titular.as_str()),
        ("licencia_plan", lic.plan.as_str()),
        ("licencia_inicio", lic.inicio.as_str()),
        ("licencia_expira", lic.expira.as_str()),
        ("licencia_notas", lic.notas.as_str()),
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

pub fn save_config(conn: &Connection, cfg: &ConfigApp) -> Result<(), String> {
    let pairs = [
        ("negocio_nombre", cfg.negocio_nombre.as_str()),
        ("negocio_direccion", cfg.negocio_direccion.as_str()),
        ("ticket_pie", cfg.ticket_pie.as_str()),
        ("umbral_db_mb", cfg.umbral_db_mb.as_str()),
        ("umbral_respaldo_dias", cfg.umbral_respaldo_dias.as_str()),
        ("caja_puede_descuento", cfg.caja_puede_descuento.as_str()),
        ("negocio_logo", cfg.negocio_logo.as_deref().unwrap_or("")),
        ("ticket_encabezado", cfg.ticket_encabezado.as_str()),
        ("ticket_mostrar_direccion", cfg.ticket_mostrar_direccion.as_str()),
        ("ticket_mostrar_fecha", cfg.ticket_mostrar_fecha.as_str()),
        ("ticket_mostrar_cajero", cfg.ticket_mostrar_cajero.as_str()),
        ("ticket_mostrar_cliente", cfg.ticket_mostrar_cliente.as_str()),
        ("ticket_mostrar_pago", cfg.ticket_mostrar_pago.as_str()),
        ("ticket_mostrar_recibido", cfg.ticket_mostrar_recibido.as_str()),
        ("ticket_mostrar_logo", cfg.ticket_mostrar_logo.as_str()),
        ("ticket_ancho", cfg.ticket_ancho.as_str()),
        ("fiscal_rtn", cfg.fiscal_rtn.as_str()),
        ("fiscal_cai", cfg.fiscal_cai.as_str()),
        ("fiscal_rango_desde", cfg.fiscal_rango_desde.as_str()),
        ("fiscal_rango_hasta", cfg.fiscal_rango_hasta.as_str()),
        ("fiscal_fecha_limite", cfg.fiscal_fecha_limite.as_str()),
        ("fiscal_isv", cfg.fiscal_isv.as_str()),
        ("fiscal_precios_con_isv", cfg.fiscal_precios_con_isv.as_str()),
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
        imagen: r.get(17)?,
    })
}

pub const PRODUCTO_SELECT: &str = "
    SELECT p.id, p.sku, p.codigo_barras, p.nombre, p.marca, p.medida, p.modelo, p.dot,
           p.proveedor_id, pr.nombre, p.costo, p.precio_venta, p.stock, p.stock_minimo,
           p.sucursal_id, s.nombre, p.activo, p.imagen
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
        dev: r.get::<_, i64>(5)? != 0,
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
