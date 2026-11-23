// Preferencia de ventana guardada en esta PC (no depende del usuario).
const MINIMIZAR_AL_CERRAR_KEY = "allco-minimizar-al-cerrar";

/** Por defecto, la X minimiza la app en vez de cerrarla. */
export function leerMinimizarAlCerrar(): boolean {
  try {
    return localStorage.getItem(MINIMIZAR_AL_CERRAR_KEY) !== "0";
  } catch {
    return true;
  }
}

export function guardarMinimizarAlCerrar(valor: boolean) {
  try {
    localStorage.setItem(MINIMIZAR_AL_CERRAR_KEY, valor ? "1" : "0");
  } catch {
    // Sin localStorage se mantiene el valor por defecto.
  }
}
