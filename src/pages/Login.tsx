import { useEffect, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Eye,
  EyeOff,
  Lock,
  LogIn,
  ScanBarcode,
  ShieldCheck,
  UserRound,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeControls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { rolLabel } from "@/lib/format";
import type { Usuario } from "@/lib/types";

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "Cobro con lector de barras",
    text: "Ventas rápidas, sin digitar códigos.",
  },
  {
    icon: WifiOff,
    title: "Funciona sin internet",
    text: "Sus datos viven en esta PC, con respaldo local.",
  },
  {
    icon: ShieldCheck,
    title: "Permisos por rol",
    text: "Administrador, bodega y caja.",
  },
];

export function LoginPage() {
  const { login } = useAuth();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api
      .usuariosLogin()
      .then((list) => {
        // El acceso de soporte (dev) siempre va de último en la lista.
        const ordenados = [...list].sort((a, b) => Number(a.dev) - Number(b.dev));
        setUsuarios(ordenados);
        const def = ordenados.find((u) => u.usuario === "admin") ?? ordenados[0];
        if (def) setUsuario(def.usuario);
      })
      .catch((e) => setError(`No se pudo cargar la lista de usuarios: ${e}`));
  }, []);

  function abrirSitio() {
    openUrl("https://allco.online/").catch(() => {
      window.open("https://allco.online/", "_blank", "noopener");
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!usuario) {
      setError("Seleccione un usuario.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(usuario, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sidebar p-5 sm:p-8">
      <img
        src="/login-bg.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-105 object-cover blur-[3px] brightness-[0.5]"
      />
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="border border-border bg-surface text-fg hover:bg-hover" />
      </div>

      <div className="relative grid w-full max-w-5xl md:min-h-[610px] md:grid-cols-[1.08fr_0.92fr]">
        {/* Panel de marca */}
        <div className="relative hidden flex-col justify-between overflow-hidden rounded-l-3xl bg-sidebar p-9 text-sidebar-fg md:flex">
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo framed={false} className="h-11 w-11" />
              <div>
                <p className="text-lg font-bold leading-tight">AllCo</p>
              </div>
            </div>
            <span className="rounded-full bg-[#1b1d22] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted">
              Windows
            </span>
          </div>

          <div className="relative my-8 max-w-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              ALLCO
            </p>
            <h1 className="mt-3 text-4xl font-bold leading-[1.1] tracking-tight">
              Tu negocio,
              <br />
              bajo control.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-sidebar-muted">
              Inventario, ventas y caja en un solo sistema. Sin depender de internet.
            </p>

            <ul className="mt-8 space-y-2.5">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="flex items-center gap-3 rounded-xl bg-[#15171b] px-3.5 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-fg">
                    <f.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">{f.title}</span>
                    <span className="block text-xs text-sidebar-muted">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex items-center justify-between text-xs text-sidebar-muted">
            <span>Sistema de escritorio</span>
            <button
              type="button"
              onClick={abrirSitio}
              className="font-medium text-accent transition-opacity hover:underline hover:opacity-80"
            >
              allco.online
            </button>
          </div>
        </div>

        {/* Formulario */}
        <div className="flex flex-col justify-center rounded-3xl bg-surface p-7 sm:p-10 md:rounded-l-none md:rounded-r-3xl">
          <div className="mb-8 md:hidden">
            <p className="text-lg font-bold leading-tight">AllCo</p>
            <p className="mt-1 text-sm text-fg-muted">Tu negocio, bajo control.</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
              <LogIn className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-fg">Iniciar sesión</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Seleccione su usuario e ingrese la contraseña.
              </p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="login-usuario" className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                Usuario
              </Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <Select
                  id="login-usuario"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  disabled={usuarios.length === 0}
                  aria-label="Usuario"
                  className="pl-10"
                >
                  {usuarios.length === 0 ? (
                    <option value="">Cargando usuarios…</option>
                  ) : (
                    usuarios.map((u) => (
                      <option
                        key={u.id}
                        value={u.usuario}
                        className={u.dev ? "italic text-fg-faint" : undefined}
                      >
                        {u.dev ? "Soporte AllCo" : `${u.nombre} · ${rolLabel(u.rol)}`}
                      </option>
                    ))
                  )}
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="login-password" className="flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" />
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
                <Input
                  id="login-password"
                  type={verPassword ? "text" : "password"}
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-faint outline-none transition-colors hover:bg-hover hover:text-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                >
                  {verPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error ? <Alert className="mb-5">{error}</Alert> : null}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || usuarios.length === 0}
            >
              <LogIn className="h-4 w-4" />
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>

          <p className="mt-6 text-xs text-fg-faint md:hidden">
            AllCo ·{" "}
            <button type="button" onClick={abrirSitio} className="font-medium text-accent-fg hover:underline">
              allco.online
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
