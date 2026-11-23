use crate::AppState;
use tauri::State;

/// La ventana de arranque guarda aquí la versión que encontró para que la
/// ventana principal pueda mostrar el aviso sin repetir la consulta.
#[tauri::command]
pub fn guardar_version_disponible(
    state: State<'_, AppState>,
    version: Option<String>,
) -> Result<(), String> {
    let mut actual = state.version_disponible.lock().map_err(|e| e.to_string())?;
    *actual = version;
    Ok(())
}

#[tauri::command]
pub fn version_disponible(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let actual = state.version_disponible.lock().map_err(|e| e.to_string())?;
    Ok(actual.clone())
}
