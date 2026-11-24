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
    // El resumen es la portada y Configuración siempre queda abierta para admin.
    if (modulo === "/" || (modulo === "/config" && user.rol === "admin")) return true;
    if (permisos === null) return true;
    return permisos.some(
      (k) => k === modulo || k === `m:${modulo}` || k.startsWith(`${modulo}:`),
    );
  }

  function puede(modulo: string, accion: string) {
    if (!user) return false;
    if (modulo === "/config" && user.rol === "admin") return true;
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
