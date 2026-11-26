//! Registro de AllCo en el inicio de Windows.

use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

/// Las compilaciones de desarrollo cargan la interfaz desde el servidor de Vite,
/// así que no deben registrarse en el inicio de Windows: al arrancar el sistema
/// se abrirían sin interfaz visible y pisarían la entrada de la app instalada.
pub fn disponible() -> bool {
    !cfg!(debug_assertions)
}

/// Estado real de la entrada de Windows. `None` en desarrollo, donde el registro
/// no se administra.
pub fn activo(app: &AppHandle) -> Option<bool> {
    if !disponible() {
        return None;
    }
    app.autolaunch().is_enabled().ok()
}

/// Deja la entrada del registro de Windows igual a la preferencia guardada.
///
/// La entrada se reescribe siempre que está activa, para corregir la ruta si la
/// app se instaló en otro lugar, se actualizó o quedó una entrada vieja de otra
/// compilación.
pub fn sincronizar(app: &AppHandle, activo: bool) -> Result<(), String> {
    if !disponible() {
        return Ok(());
    }
    let manager = app.autolaunch();
    if activo {
        // `enable` también reactiva la entrada si Windows la deshabilitó.
        manager.enable().map_err(|e| e.to_string())
    } else {
        manager.disable().map_err(|e| e.to_string())
    }
}
