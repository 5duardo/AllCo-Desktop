import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Usuario } from "@/lib/types";

type AuthCtx = {
  user: Usuario | null;
  ready: boolean;
  /** null = el usuario usa el acceso que le da su rol. */
  permisos: string[] | null;
  tieneAcceso: (modulo: string) => boolean;
  puede: (modulo: string, accion: string) => boolean;
  recargarPermisos: () => Promise<void>;
  login: (usuario: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

/** Módulos unificados: cualquier permiso antiguo del grupo da acceso. */
const ALIAS_MODULOS: Record<string, string[]> = {
  "/ventas": ["/facturacion", "/reportes", "/finanzas", "/talonarios"],
  "/catalogo": ["/inventario", "/servicios", "/proveedores"],
  "/personas": ["/empleados", "/config"],
  "/sistema": ["/status", "/base-datos"],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Usuario | null>(null);
  const [permisos, setPermisos] = useState<string[] | null>(null);
  const [ready, setReady] = useState(false);

  async function cargarPermisos() {
    try {
      setPermisos(await api.misPermisos());
    } catch {
      setPermisos(null);
    }
  }

  useEffect(() => {
    api
      .sesionActual()
      .then(async (u) => {
        setUser(u);
        if (u) await cargarPermisos();
      })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  async function login(usuario: string, password: string) {
    const u = await api.login(usuario, password);
    setUser(u);
    await cargarPermisos();
  }

  async function logout() {
    await api.logout();
    setUser(null);
    setPermisos(null);
  }

  function tieneAcceso(modulo: string) {
    if (!user) return false;
    // El resumen es la portada y el administrador siempre ve todos los módulos.
    if (modulo === "/" || user.rol === "admin") return true;
    if (permisos === null) return true;
    const claves = [modulo, ...(ALIAS_MODULOS[modulo] ?? [])];
    return permisos.some((k) =>
      claves.some((m) => k === m || k === `m:${m}` || k.startsWith(`${m}:`)),
    );
  }

  function puede(modulo: string, accion: string) {
    if (!user) return false;
    if (user.rol === "admin" && (modulo === "/config" || modulo === "/finanzas"))
      return true;
    if (permisos === null) return true;
    // Un permiso antiguo de módulo suelto implicaba todas las acciones.
    return permisos.includes(modulo) || permisos.includes(`${modulo}:${accion}`);
  }

  return (
    <Ctx.Provider
      value={{ user, ready, permisos, tieneAcceso, puede, recargarPermisos: cargarPermisos, login, logout }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
