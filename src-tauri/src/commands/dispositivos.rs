use crate::commands::auth::{require_roles, require_user};
use crate::db;
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::process::Command;
use tauri::{Manager, State};

#[derive(Clone, Serialize)]
pub struct Impresora {
    pub nombre: String,
    pub puerto: String,
    pub driver: String,
    pub predeterminada: bool,
    pub sin_conexion: bool,
    /// false = detectada por USB pero sin cola de impresión en Windows.
    pub instalada: bool,
    /// Se puede imprimir directo al USB sin instalar driver (puente USBPRINT).
    pub puente: bool,
    /// Ruta de la interfaz USB para impresión directa (vacía si no aplica).
    pub ruta: String,
}

#[derive(Clone, Serialize)]
pub struct DispositivoSimple {
    pub nombre: String,
    pub clase: String,
    pub estado: String,
}

#[derive(Clone, Serialize)]
pub struct DispositivosData {
    pub impresoras: Vec<Impresora>,
    pub lectores: Vec<DispositivoSimple>,
    pub usb: Vec<DispositivoSimple>,
    pub ultimo_escaneo: Option<String>,
    pub impresora_ticket: String,
    /// "usb" = conexión directa sin driver; "spooler" = impresora de Windows.
    pub modo: String,
    pub errores: Vec<String>,
    /// La detección se está actualizando en segundo plano.
    pub detectando: bool,
}

/// Caché de detección: evita consultar Windows cada vez que se abre la página.
#[derive(Default)]
pub struct DispositivosCache {
    pub datos: Option<DispositivosData>,
    pub actualizado: i64,
    pub refrescando: bool,
}

impl DispositivosData {
    fn vacio(state: &AppState) -> Self {
        let conn = state.db.lock().ok();
        let (impresora_ticket, modo, _) = conn
            .as_ref()
            .map(|c| configuracion_impresora(c))
            .unwrap_or_default();
        Self {
            impresoras: Vec::new(),
            lectores: Vec::new(),
            usb: Vec::new(),
            ultimo_escaneo: state.last_scan.lock().ok().and_then(|s| s.clone()),
            impresora_ticket,
            modo,
            errores: Vec::new(),
            detectando: true,
        }
    }
}

/// Ejecuta un script de PowerShell y devuelve su salida JSON.
/// Los dispositivos se consultan con WMI/CIM: funciona sin internet ni drivers extra.
fn powershell_json(script: &str) -> Result<serde_json::Value, String> {
    let full = format!("[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; {script}");
    let out = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &full])
        .output()
        .map_err(|e| format!("No se pudo ejecutar PowerShell: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "Error consultando dispositivos: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::Value::Null);
    }
    serde_json::from_str(trimmed).map_err(|e| format!("Respuesta inválida de Windows: {e}"))
}

/// ConvertTo-Json devuelve un objeto suelto cuando hay un solo resultado.
fn as_array(v: serde_json::Value) -> Vec<serde_json::Value> {
    match v {
        serde_json::Value::Array(a) => a,
        serde_json::Value::Null => vec![],
        other => vec![other],
    }
}

fn usb_id(id: &str, tag: &str) -> String {
    if let Some(i) = id.find(tag) {
        let rest = &id[i + tag.len()..];
        let end = rest.find('&').unwrap_or(rest.len());
        return rest[..end.min(4)].to_string();
    }
    String::new()
}

fn usb_port(id: &str) -> String {
    if let Some(i) = id.rfind("USB0") {
        return id[i..]
            .chars()
            .take_while(|c| c.is_ascii_alphanumeric())
            .collect();
    }
    String::new()
}

fn normalizar(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .flat_map(|c| c.to_uppercase())
        .collect()
}

fn ya_listada(impresoras: &[Impresora], nombre: &str) -> bool {
    let n = normalizar(nombre);
    impresoras
        .iter()
        .any(|p| normalizar(&p.nombre) == n || normalizar(&p.nombre).contains(&n))
}

pub fn configuracion_impresora(conn: &rusqlite::Connection) -> (String, String, String) {
    let nombre: String = conn
        .query_row(
            "SELECT valor FROM configuracion WHERE clave = 'impresora_ticket'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    let modo: String = conn
        .query_row(
            "SELECT valor FROM configuracion WHERE clave = 'impresora_ticket_modo'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_else(|| "spooler".into());
    let ruta: String = conn
        .query_row(
            "SELECT valor FROM configuracion WHERE clave = 'impresora_usb_ruta'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_default();
    (nombre, modo, ruta)
}

/// Consulta Windows una sola vez. Se ejecuta en un hilo de fondo para que la
/// interfaz no se congele al entrar a la página de dispositivos.
fn detectar_dispositivos(state: &AppState) -> Result<DispositivosData, String> {
    let mut errores: Vec<String> = Vec::new();
    let puentes = usb_bridge::dispositivos();

    // Un solo proceso de PowerShell para todas las consultas (antes eran 4).
    const SCRIPT: &str = r#"
$p=@(Get-CimInstance Win32_Printer | Select-Object Name,Default,WorkOffline,PortName,DriverName);
$k=@(Get-CimInstance Win32_Keyboard | Select-Object Name,Status);
$d=@(Get-PnpDevice -PresentOnly | Select-Object FriendlyName,Class,Status,InstanceId);
[pscustomobject]@{
  printers=$p; keyboards=$k;
  pnp=@($d | Where-Object { $_.Class -eq 'Printer' -or $_.FriendlyName -match '(?i)(\bSAT\b|SATQ15|Q15T|ESCPOS|ESC.POS|THERMAL|RECEIPT|IMPRESORA|PRINTER|POS-|TM-|XPRINTER|RONGTA|GOOJPRT|BIXOLON|SEWOO|STAR)' } | Select-Object FriendlyName,Class,Status,InstanceId);
  usb=@($d | Where-Object { $_.Class -eq 'USB' -or $_.Class -eq 'HIDClass' } | Select-Object FriendlyName,Class,Status)
} | ConvertTo-Json -Depth 4 -Compress
"#;
    let datos = match powershell_json(SCRIPT) {
        Ok(v) => v,
        Err(e) => {
            errores.push(format!("No se pudieron consultar los dispositivos de Windows: {e}"));
            serde_json::Value::Null
        }
    };

    // 1) Impresoras instaladas en el spooler de Windows.
    let mut impresoras: Vec<Impresora> = as_array(datos["printers"].clone())
        .into_iter()
        .filter_map(|v| {
            let nombre = v["Name"].as_str()?.to_string();
            Some(Impresora {
                puente: puentes
                    .iter()
                    .any(|(token, _)| token.contains(&normalizar(&nombre))),
                nombre,
                predeterminada: v["Default"].as_bool().unwrap_or(false),
                sin_conexion: v["WorkOffline"].as_bool().unwrap_or(false),
                puerto: v["PortName"].as_str().unwrap_or("").to_string(),
                driver: v["DriverName"].as_str().unwrap_or("").to_string(),
                instalada: true,
                ruta: String::new(),
            })
        })
        .collect();

    // 2) Impresoras térmicas conectadas por USB aunque no tengan driver.
    for d in as_array(datos["pnp"].clone()) {
                let nombre = match d["FriendlyName"].as_str() {
                    Some(n) if !n.trim().is_empty() => n.to_string(),
                    _ => continue,
                };
                let token = normalizar(&nombre);
                let id = d["InstanceId"].as_str().unwrap_or("");
                let vid = usb_id(id, "VID_");
                let pid = usb_id(id, "PID_");
                let vidpid = if vid.is_empty() {
                    String::new()
                } else {
                    format!("VID{vid}PID{pid}")
                };
                let buscar_ruta = |t: &str| {
                    puentes
                        .iter()
                        .find(|(tok, _)| {
                            (!vidpid.is_empty() && tok.contains(&vidpid))
                                || (t.len() > 4 && tok.contains(t))
                        })
                        .map(|(_, r)| r.clone())
                        .unwrap_or_default()
                };
                let ruta = buscar_ruta(&token);
                let puente = !ruta.is_empty();
                if ya_listada(&impresoras, &nombre) {
                    if let Some(existente) = impresoras
                        .iter_mut()
                        .find(|p| normalizar(&p.nombre) == token)
                    {
                        existente.puente |= puente;
                        if existente.ruta.is_empty() {
                            existente.ruta = ruta;
                        }
                        if existente.puerto.is_empty() {
                            let info = format!("USB VID_{vid} PID_{pid}");
                            existente.puerto = if existente.puerto.is_empty() {
                                info
                            } else {
                                format!("{} · {info}", existente.puerto)
                            };
                        }
                    }
                    continue;
                }
                let puerto = match (usb_port(id), vid.is_empty()) {
                    (p, false) if !p.is_empty() => format!("{p} · USB VID_{vid} PID_{pid}"),
                    (p, true) if !p.is_empty() => p,
                    (_, false) => format!("USB VID_{vid} PID_{pid}"),
                    _ => String::new(),
                };
                impresoras.push(Impresora {
                    nombre,
                    predeterminada: false,
                    sin_conexion: d["Status"].as_str() != Some("OK"),
                    puerto,
                    driver: String::new(),
                    instalada: false,
                    puente,
                    ruta,
                });
    }

    // 3) Teclados / lector de código de barras.
    let lectores = as_array(datos["keyboards"].clone())
        .into_iter()
        .filter_map(|v| {
                Some(DispositivoSimple {
                    nombre: v["Name"].as_str()?.to_string(),
                    clase: "Teclado / lector HID".to_string(),
                    estado: v["Status"].as_str().unwrap_or("").to_string(),
                })
            })
        .collect();

    let usb: Vec<DispositivoSimple> = as_array(datos["usb"].clone())
        .into_iter()
        .filter_map(|v| {
                let nombre = v["FriendlyName"].as_str()?.to_string();
                if ya_listada(&impresoras, &nombre) {
                    return None;
                }
                Some(DispositivoSimple {
                    nombre,
                    clase: v["Class"].as_str().unwrap_or("").to_string(),
                    estado: v["Status"].as_str().unwrap_or("").to_string(),
                })
            })
        .collect();

    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let (impresora_ticket, modo, _) = configuracion_impresora(&conn);
    let ultimo_escaneo = state.last_scan.lock().ok().and_then(|s| s.clone());

    Ok(DispositivosData {
        impresoras,
        lectores,
        usb,
        ultimo_escaneo,
        impresora_ticket,
        modo,
        errores,
        detectando: false,
    })
}

/// Lanza la detección en un hilo aparte; la UI recibe los datos de la caché
/// mientras tanto y los recoge en la siguiente llamada.
fn iniciar_refresco(app: &tauri::AppHandle) {
    let state = match app.try_state::<AppState>() {
        Some(s) => s,
        None => return,
    };
    {
        let mut c = match state.dispositivos_cache.lock() {
            Ok(c) => c,
            Err(_) => return,
        };
        if c.refrescando {
            return;
        }
        c.refrescando = true;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(state) = app.try_state::<AppState>() {
            let resultado = detectar_dispositivos(&state);
            if let Ok(mut c) = state.dispositivos_cache.lock() {
                if let Ok(d) = resultado {
                    c.datos = Some(d);
                }
                c.actualizado = chrono::Local::now().timestamp();
                c.refrescando = false;
            }
        }
    });
}

#[tauri::command]
pub fn listar_dispositivos(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<DispositivosData, String> {
    require_user(&state)?;
    let ahora = chrono::Local::now().timestamp();
    let (datos, actualizado, refrescando) = {
        let c = state
            .dispositivos_cache
            .lock()
            .map_err(|_| "Error interno".to_string())?;
        (c.datos.clone(), c.actualizado, c.refrescando)
    };

    // La caché dura 30 s: al entrar a la página se devuelve al instante.
    if datos.is_some() && ahora - actualizado < 30 && !refrescando {
        return Ok(datos.unwrap());
    }
    if !refrescando {
        iniciar_refresco(&app);
    }
    if let Some(mut d) = datos {
        d.detectando = true;
        return Ok(d);
    }
    Ok(DispositivosData::vacio(&state))
}

#[tauri::command]
pub fn actualizar_dispositivos(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<DispositivosData, String> {
    require_user(&state)?;
    iniciar_refresco(&app);
    let c = state
        .dispositivos_cache
        .lock()
        .map_err(|_| "Error interno".to_string())?;
    if let Some(mut d) = c.datos.clone() {
        d.detectando = c.refrescando;
        return Ok(d);
    }
    Ok(DispositivosData::vacio(&state))
}

#[tauri::command]
pub fn guardar_impresora_ticket(
    state: State<AppState>,
    nombre: String,
    modo: Option<String>,
    ruta: Option<String>,
) -> Result<(), String> {
    require_roles(&state, &["admin", "caja"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let modo = if modo.as_deref() == Some("usb") {
        "usb"
    } else {
        "spooler"
    };
    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('impresora_ticket', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![nombre.trim()],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('impresora_ticket_modo', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![modo],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO configuracion (clave, valor) VALUES ('impresora_usb_ruta', ?1)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
        params![ruta.filter(|r| !r.is_empty() && modo == "usb").unwrap_or_default()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// ESC/POS trabaja mejor con ASCII plano: se reemplazan los acentos para que
/// ningún modelo de impresora imprima caracteres raros.
fn sanitizar(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'á' | 'Á' => 'a',
            'é' | 'É' => 'e',
            'í' | 'Í' => 'i',
            'ó' | 'Ó' => 'o',
            'ú' | 'Ú' | 'ü' | 'Ü' => 'u',
            'ñ' | 'Ñ' => 'n',
            '¡' => '!',
            '¿' => '?',
            '—' | '–' => '-',
            other => other,
        })
        .collect()
}

fn bytes_ticket(contenido: &str) -> Vec<u8> {
    let mut data: Vec<u8> = Vec::new();
    data.extend_from_slice(&[0x1B, 0x40]); // ESC @: reinicia la impresora
    let texto = sanitizar(contenido).replace('\n', "\r\n");
    data.extend_from_slice(texto.as_bytes());
    data.extend_from_slice(b"\r\n\r\n\r\n\r\n");
    data.extend_from_slice(&[0x1D, 0x56, 0x42, 0x00]); // GS V: corte parcial
    data
}

/// Imprime usando la impresora configurada, ya sea por USB directo o por Windows.
pub fn imprimir_ticket(
    conn: &rusqlite::Connection,
    impresora: &str,
    contenido: &str,
) -> Result<(), String> {
    let modo: String = conn
        .query_row(
            "SELECT valor FROM configuracion WHERE clave = 'impresora_ticket_modo'",
            [],
            |r| r.get(0),
        )
        .optional()
        .ok()
        .flatten()
        .unwrap_or_else(|| "spooler".into());
    let data = bytes_ticket(contenido);
    if modo == "usb" {
        let ruta: String = conn
            .query_row(
                "SELECT valor FROM configuracion WHERE clave = 'impresora_usb_ruta'",
                [],
                |r| r.get(0),
            )
            .optional()
            .ok()
            .flatten()
            .unwrap_or_default();
        if ruta.is_empty() {
            usb_bridge::imprimir(impresora, &data)
        } else {
            usb_bridge::imprimir_ruta(&ruta, &data)
        }
    } else {
        raw_print(impresora, &data)
    }
}

#[tauri::command]
pub fn imprimir_prueba(
    state: State<AppState>,
    impresora: String,
    modo: Option<String>,
    ruta: Option<String>,
) -> Result<String, String> {
    let user = require_roles(&state, &["admin", "caja"])?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let cfg = db::config_map(&conn)?;
    let ticket = format!(
        "{}\n{}\n--------------------------------\nPRUEBA DE IMPRESION\n{}\nUsuario: {}\n--------------------------------\nLa impresora esta lista para\nimprimir las facturas de caja.\n",
        cfg.negocio_nombre,
        cfg.negocio_direccion,
        db::now(),
        user.nombre
    );
    let resultado = match modo.as_deref() {
        Some("usb") => {
            let data = bytes_ticket(&ticket);
            match ruta.filter(|r| !r.is_empty()) {
                Some(r) => usb_bridge::imprimir_ruta(&r, &data),
                None => usb_bridge::imprimir(&impresora, &data),
            }
        }
        _ => imprimir_ticket(&conn, &impresora, &ticket),
    };
    match resultado {
        Ok(_) => {
            let _ = db::log_event(
                &conn,
                "print_ok",
                Some(user.id),
                &format!("Prueba de impresión en {impresora}"),
                None,
            );
            Ok(impresora)
        }
        Err(e) => {
            let _ = db::log_event(
                &conn,
                "print_fail",
                Some(user.id),
                &format!("Prueba en {impresora}: {e}"),
                None,
            );
            Err(e)
        }
    }
}

#[tauri::command]
pub fn imprimir_factura(
    state: State<AppState>,
    venta_id: i64,
    impresora: Option<String>,
    modo: Option<String>,
) -> Result<String, String> {
    let user = require_roles(&state, &["admin", "caja"])?;
    let path = state
        .data_dir
        .join("tickets")
        .join(format!("ticket-{venta_id}.txt"));
    let ticket = std::fs::read_to_string(&path)
        .map_err(|_| "No hay copia de la factura.".to_string())?;
    let conn = state.db.lock().map_err(|_| "Error interno".to_string())?;
    let (configurada, modo_cfg, ruta_cfg) = configuracion_impresora(&conn);
    let nombre = impresora
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(configurada);
    if nombre.trim().is_empty() {
        return Err("No hay impresora configurada. Seleccione una en Dispositivos.".into());
    }
    let elegido = modo.or(Some(modo_cfg));
    let resultado = match elegido.as_deref() {
        Some("usb") => {
            let data = bytes_ticket(&ticket);
            if ruta_cfg.is_empty() {
                usb_bridge::imprimir(&nombre, &data)
            } else {
                usb_bridge::imprimir_ruta(&ruta_cfg, &data)
            }
        }
        _ => raw_print(&nombre, &bytes_ticket(&ticket)),
    };
    match resultado {
        Ok(_) => {
            let _ = db::log_event(
                &conn,
                "print_ok",
                Some(user.id),
                &format!("Factura #{venta_id} impresa en {nombre}"),
                None,
            );
            Ok(nombre)
        }
        Err(e) => {
            let _ = db::log_event(
                &conn,
                "print_fail",
                Some(user.id),
                &format!("Factura #{venta_id}: {e}"),
                None,
            );
            Err(e)
        }
    }
}

#[cfg(target_os = "windows")]
fn raw_print(impresora: &str, data: &[u8]) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::{
        ClosePrinter, EndDocPrinter, EndPagePrinter, OpenPrinterW, StartDocPrinterW,
        StartPagePrinter, WritePrinter, DOC_INFO_1W,
    };

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    unsafe {
        let nombre = wide(impresora);
        let mut handle: HANDLE = std::ptr::null_mut();
        if OpenPrinterW(nombre.as_ptr(), &mut handle, std::ptr::null()) == 0 {
            return Err(format!(
                "No se encontró la impresora \"{impresora}\". Revise que siga instalada."
            ));
        }
        let result: Result<(), String> = (|| {
            let titulo = wide("AllCo - Factura");
            let raw = wide("RAW");
            let doc = DOC_INFO_1W {
                pDocName: titulo.as_ptr() as *mut u16,
                pOutputFile: std::ptr::null_mut(),
                pDatatype: raw.as_ptr() as *mut u16,
            };
            if StartDocPrinterW(handle, 1, &doc) == 0 {
                return Err("No se pudo iniciar el documento de impresión.".to_string());
            }
            if StartPagePrinter(handle) == 0 {
                EndDocPrinter(handle);
                return Err("No se pudo iniciar la página.".into());
            }
            let mut written: u32 = 0;
            let ok = WritePrinter(
                handle,
                data.as_ptr() as *const _,
                data.len() as u32,
                &mut written,
            );
            EndPagePrinter(handle);
            EndDocPrinter(handle);
            if ok == 0 || written as usize != data.len() {
                return Err(
                    "La impresora no aceptó los datos. Revise que esté encendida y conectada."
                        .into(),
                );
            }
            Ok(())
        })();
        ClosePrinter(handle);
        result
    }
}

#[cfg(not(target_os = "windows"))]
fn raw_print(_impresora: &str, _data: &[u8]) -> Result<(), String> {
    Err("La impresión solo está disponible en Windows.".into())
}

/// Puente de impresión directa sobre USBPRINT (el driver genérico que Windows
/// ya incluye). Permite imprimir tickets sin crear cola ni instalar drivers.
#[cfg(target_os = "windows")]
mod usb_bridge {
    use std::ffi::OsString;
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use windows_sys::core::GUID;
    use windows_sys::Win32::Devices::DeviceAndDriverInstallation::{
        SetupDiDestroyDeviceInfoList, SetupDiEnumDeviceInterfaces, SetupDiGetClassDevsW,
        SetupDiGetDeviceInterfaceDetailW, SP_DEVICE_INTERFACE_DATA,
        SP_DEVICE_INTERFACE_DETAIL_DATA_W, DIGCF_DEVICEINTERFACE, DIGCF_PRESENT,
    };
    use windows_sys::Win32::Foundation::{GENERIC_WRITE, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, WriteFile, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE,
        OPEN_EXISTING,
    };

    // GUID_DEVINTERFACE_USBPRINT (usbprint.sys, incluido en Windows).
    const GUID_USBPRINT: GUID = GUID {
        data1: 0x28D7_8FAD,
        data2: 0x5A12,
        data3: 0x11D1,
        data4: [0xAE, 0x5B, 0x00, 0x00, 0xF8, 0x03, 0xA8, 0xC2],
    };

    /// Devuelve (identificador normalizado, ruta del dispositivo) para cada
    /// impresora USBPRINT presente, por ejemplo SAT SATQ15U.
    pub fn dispositivos() -> Vec<(String, String)> {
        unsafe {
            let set = SetupDiGetClassDevsW(
                &GUID_USBPRINT,
                std::ptr::null(),
                std::ptr::null_mut(),
                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
            );
            if set == 0 || set == -1 {
                return Vec::new();
            }
            let mut salida = Vec::new();
            let mut i = 0u32;
            loop {
                let mut interfaz: SP_DEVICE_INTERFACE_DATA = std::mem::zeroed();
                interfaz.cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DATA>() as u32;
                if SetupDiEnumDeviceInterfaces(
                    set,
                    std::ptr::null(),
                    &GUID_USBPRINT,
                    i,
                    &mut interfaz,
                ) == 0
                {
                    break;
                }
                let mut necesario = 0u32;
                SetupDiGetDeviceInterfaceDetailW(
                    set,
                    &interfaz,
                    std::ptr::null_mut(),
                    0,
                    &mut necesario,
                    std::ptr::null_mut(),
                );
                if necesario > 0 && necesario < 8192 {
                    let palabras = (necesario as usize) / 2 + 8;
                    let mut buf = vec![0u16; palabras];
                    let detalle = buf.as_mut_ptr() as *mut SP_DEVICE_INTERFACE_DETAIL_DATA_W;
                    (*detalle).cbSize = std::mem::size_of::<SP_DEVICE_INTERFACE_DETAIL_DATA_W>() as u32;
                    if SetupDiGetDeviceInterfaceDetailW(
                        set,
                        &interfaz,
                        detalle,
                        necesario,
                        std::ptr::null_mut(),
                        std::ptr::null_mut(),
                    ) != 0
                    {
                        let ptr = std::ptr::addr_of!((*detalle).DevicePath) as *const u16;
                        let mut len = 0usize;
                        while len < palabras && *ptr.add(len) != 0 {
                            len += 1;
                        }
                        let ruta = OsString::from_wide(std::slice::from_raw_parts(ptr, len))
                            .to_string_lossy()
                            .to_string();
                        let token = token_usbprint(&ruta);
                        salida.push((token, ruta));
                    }
                }
                i += 1;
            }
            SetupDiDestroyDeviceInfoList(set);
            salida
        }
    }

    fn token_usbprint(ruta: &str) -> String {
        ruta.chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .flat_map(|c| c.to_uppercase())
            .collect()
    }

    pub fn imprimir(nombre: &str, data: &[u8]) -> Result<(), String> {
        let token: String = nombre
            .chars()
            .filter(|c| c.is_ascii_alphanumeric())
            .flat_map(|c| c.to_uppercase())
            .collect();
        let dispositivos = dispositivos();
        let found = dispositivos
            .iter()
            .find(|(t, _)| t.contains(&token) || (!token.is_empty() && token.contains(t)));
        let (_, ruta) = found.ok_or_else(|| {
            "No se encontró la impresora USB. Vuelva a detectar dispositivos y conéctela.".to_string()
        })?;
        imprimir_ruta(ruta, data)
    }

    /// Escribe los bytes ESC/POS directamente en la ruta de interfaz USBPRINT.
    pub fn imprimir_ruta(ruta: &str, data: &[u8]) -> Result<(), String> {
        let ruta_ancho: Vec<u16> = std::ffi::OsStr::new(ruta)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        unsafe {
            let handle = CreateFileW(
                ruta_ancho.as_ptr(),
                GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_ATTRIBUTE_NORMAL,
                std::ptr::null_mut(),
            );
            if handle == INVALID_HANDLE_VALUE {
                return Err(
                    "No se pudo abrir la impresora USB. Puede estar ocupada por otro programa."
                        .to_string(),
                );
            }
            let mut escritos: u32 = 0;
            let ok = WriteFile(
                handle,
                data.as_ptr() as *const _,
                data.len() as u32,
                &mut escritos,
                std::ptr::null_mut(),
            );
            windows_sys::Win32::Foundation::CloseHandle(handle);
            if ok == 0 || escritos as usize != data.len() {
                return Err("La impresora USB no aceptó los datos. Revise el cable y que esté encendida.".into());
            }
            Ok(())
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod usb_bridge {
    pub fn dispositivos() -> Vec<(String, String)> {
        Vec::new()
    }
    pub fn imprimir(_nombre: &str, _data: &[u8]) -> Result<(), String> {
        Err("La impresión USB solo está disponible en Windows.".into())
    }
    pub fn imprimir_ruta(_ruta: &str, _data: &[u8]) -> Result<(), String> {
        Err("La impresión USB solo está disponible en Windows.".into())
    }
}

