import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ChevronsUpDown,
  LifeBuoy,
  Loader2,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  BeakerIcon,
  Cog6ToothIcon,
  CubeIcon,
  DocumentTextIcon,
  HomeIcon,
  IdentificationIcon,
  PrinterIcon,
  ShoppingCartIcon,
  UsersIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";
import {
  BeakerIcon as BeakerSolidIcon,
  Cog6ToothIcon as Cog6ToothSolidIcon,
  CubeIcon as CubeSolidIcon,
  DocumentTextIcon as DocumentTextSolidIcon,
  HomeIcon as HomeSolidIcon,
  IdentificationIcon as IdentificationSolidIcon,
  PrinterIcon as PrinterSolidIcon,
  ShoppingCartIcon as ShoppingCartSolidIcon,
  UsersIcon as UsersSolidIcon,
  WrenchIcon as WrenchSolidIcon,
} from "@heroicons/react/24/solid";
import { useAuth } from "@/context/AuthContext";
import { useFullscreen } from "@/context/FullscreenContext";
import { useTheme } from "@/context/ThemeContext";
import { useToast } from "@/context/ToastContext";
import { useUpdates } from "@/context/UpdateContext";
import { BrandLogo } from "@/components/BrandLogo";
import { api } from "@/lib/api";
import { rolLabel } from "@/lib/format";
import type { MarcaNegocio, Rol, Usuario } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavIcon = ComponentType<{ className?: string }>;
type NavGroup = "operacion" | "inventario" | "administracion" | "desarrollo";

const GRUPOS: { id: NavGroup; label: string }[] = [
  { id: "operacion", label: "Operación" },
  { id: "inventario", label: "Inventario y servicios" },
  { id: "administracion", label: "Administración" },
  { id: "desarrollo", label: "Desarrollo" },
];

const NAV: {
  to: string;
  label: string;
  icon: NavIcon;
  iconSolid: NavIcon;
  group: NavGroup;
  roles: Rol[];
  devOnly?: boolean;
}[] = [
  { to: "/", label: "Resumen", icon: HomeIcon, iconSolid: HomeSolidIcon, group: "operacion", roles: ["admin", "caja", "bodega"] },
  { to: "/pos", label: "Punto de venta", icon: ShoppingCartIcon, iconSolid: ShoppingCartSolidIcon, group: "operacion", roles: ["admin", "caja"] },
  { to: "/ventas", label: "Ventas", icon: DocumentTextIcon, iconSolid: DocumentTextSolidIcon, group: "operacion", roles: ["admin", "caja"] },
  { to: "/clientes", label: "Clientes", icon: IdentificationIcon, iconSolid: IdentificationSolidIcon, group: "operacion", roles: ["admin", "caja"] },
  { to: "/catalogo", label: "Catálogo", icon: CubeIcon, iconSolid: CubeSolidIcon, group: "inventario", roles: ["admin", "bodega"] },
  { to: "/dispositivos", label: "Dispositivos", icon: PrinterIcon, iconSolid: PrinterSolidIcon, group: "inventario", roles: ["admin", "caja"] },
  { to: "/personas", label: "Personas", icon: UsersIcon, iconSolid: UsersSolidIcon, group: "administracion", roles: ["admin"] },
  { to: "/sistema", label: "Sistema", icon: WrenchIcon, iconSolid: WrenchSolidIcon, group: "administracion", roles: ["admin"] },
  { to: "/config", label: "Configuración", icon: Cog6ToothIcon, iconSolid: Cog6ToothSolidIcon, group: "administracion", roles: ["admin"] },
  { to: "/pruebas", label: "Pruebas", icon: BeakerIcon, iconSolid: BeakerSolidIcon, group: "desarrollo", roles: ["admin"], devOnly: true },
];

const COLLAPSE_KEY = "allco-sidebar-collapsed";

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

function ProfileMenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-muted outline-none transition-colors hover:bg-[var(--menu-hover)] hover:text-sidebar-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        danger && "text-red-300 hover:bg-[#332022] hover:text-red-200",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export function AppShell() {
  const { user, logout, cambiarCuenta, permisos, tieneAcceso } = useAuth();
  const { accent, resolvedMode } = useTheme();
  const { pantallaCompleta } = useFullscreen();
  const { nuevaVersion } = useUpdates();
  const toast = useToast();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [cambiarOpen, setCambiarOpen] = useState(false);
  const [cuentas, setCuentas] = useState<Usuario[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(false);
  const [cuentaSel, setCuentaSel] = useState("");
  const [claveCuenta, setClaveCuenta] = useState("");
  const [cambiando, setCambiando] = useState(false);
  const [errorCuenta, setErrorCuenta] = useState("");
  const [marca, setMarca] = useState<MarcaNegocio | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Nombre y logo del negocio para la marca del sidebar.
  useEffect(() => {
    const cargarMarca = () => {
      api
        .marcaNegocio()
        .then(setMarca)
        .catch(() => {});
    };
    cargarMarca();
    window.addEventListener("allco-brand", cargarMarca);
    return () => window.removeEventListener("allco-brand", cargarMarca);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Carga las cuentas disponibles cada vez que se abre el cambio de cuenta.
  useEffect(() => {
    if (!cambiarOpen || !user) return;
    let vigente = true;
    setCuentaSel("");
    setClaveCuenta("");
    setErrorCuenta("");
    setCargandoCuentas(true);
    api
      .usuariosLogin()
      .then((list) => {
        if (vigente) setCuentas(list.filter((u) => u.id !== user.id));
      })
      .catch((e) => {
        if (vigente)
          setErrorCuenta(`No se pudieron cargar las cuentas: ${String(e)}`);
      })
      .finally(() => {
        if (vigente) setCargandoCuentas(false);
      });
    return () => {
      vigente = false;
    };
  }, [cambiarOpen, user]);

  if (!user) return null;

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  async function onCambiarCuenta() {
    if (!cuentaSel) {
      setErrorCuenta("Seleccione una cuenta.");
      return;
    }
    if (!claveCuenta) {
      setErrorCuenta("Ingrese la contraseña de la cuenta.");
      return;
    }
    setCambiando(true);
    setErrorCuenta("");
    const nombre = cuentas.find((c) => c.usuario === cuentaSel)?.nombre ?? cuentaSel;
    try {
      await cambiarCuenta(cuentaSel, claveCuenta);
      setCambiarOpen(false);
      setClaveCuenta("");
      toast.ok(`Sesión iniciada como ${nombre}.`);
      navigate("/");
    } catch (err) {
      setErrorCuenta(err instanceof Error ? err.message : String(err));
    } finally {
      setCambiando(false);
    }
  }

  const items = NAV.filter((n) => {
    if (n.devOnly && !user.dev) return false;
    if (permisos !== null) return tieneAcceso(n.to);
    return n.roles.includes(user.rol);
  });
  const nombreNegocio = marca?.nombre?.trim() || "AllCo";
  const ubicacionNegocio = marca?.direccion?.trim() || "";
  // El acento neutro es negro en tema claro: sobre el sidebar oscuro
  // necesita un fondo translúcido para que el ítem activo se distinga.
  const neutralOnDarkSidebar = accent === "neutro" && resolvedMode === "light";
  const initials = iniciales(user.nombre);
  const cuentaElegida = cuentas.find((c) => c.usuario === cuentaSel);

  return (
    <div className="flex h-full overflow-hidden bg-bg">
      <aside
        className={cn(
          "relative z-10 flex shrink-0 flex-col bg-sidebar text-sidebar-fg transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          collapsed ? "w-20" : "w-64",
          pantallaCompleta && "hidden",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-expanded={!collapsed}
          className="absolute -right-3.5 top-7 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-border-strong bg-surface text-fg-muted outline-none transition-all hover:scale-110 hover:text-accent-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>

        <div
          className={cn(
            "flex items-center gap-3 overflow-hidden py-5 transition-[padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
            collapsed ? "px-[18px]" : "px-5",
          )}
          title={
            collapsed
              ? ubicacionNegocio
                ? `${nombreNegocio} · ${ubicacionNegocio}`
                : nombreNegocio
              : undefined
          }
        >
          <BrandLogo
            logo={marca?.logo}
            name={nombreNegocio}
            className="h-11 w-11"
          />
          <div
            className={cn(
              "min-w-0 overflow-hidden transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              collapsed
                ? "max-w-0 -translate-x-2 opacity-0"
                : "max-w-[200px] translate-x-0 opacity-100",
            )}
          >
            <p className="truncate whitespace-nowrap text-base font-bold leading-tight">
              {nombreNegocio}
            </p>
            <p
              className="truncate whitespace-nowrap text-[11px] text-sidebar-muted"
              title={ubicacionNegocio || undefined}
            >
              {ubicacionNegocio || (
                <>
                  Impulsado por <span className="font-medium text-sidebar-fg">AllCo</span>
                </>
              )}
            </p>
          </div>
        </div>

        <nav className="sidebar-scroll flex-1 overflow-y-auto p-3" aria-label="Menú principal">
          {GRUPOS.map((grupo, indice) => {
            const visibles = items.filter((item) => item.group === grupo.id);
            if (visibles.length === 0) return null;
            return (
              <div key={grupo.id} className={cn(indice > 0 && "mt-4")}>
                <div
                  className={cn(
                    "overflow-hidden transition-[max-height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    collapsed ? "max-h-0 opacity-0" : "max-h-9 opacity-100",
                  )}
                >
                  <p className="whitespace-nowrap px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">
                    {grupo.label}
                  </p>
                </div>
                <div className="space-y-1">
                  {visibles.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      title={item.label}
                      aria-label={item.label}
                      className={({ isActive }) =>
                        cn(
                          "sidebar-link flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                          collapsed ? "px-[19px]" : "px-3",
                          isActive
                            ? neutralOnDarkSidebar
                              ? "bg-[#1d1f23] text-white"
                              : "bg-accent text-on-accent"
                            : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
                        )
                      }
                    >
                      {({ isActive }) => {
                        const Icon = isActive ? item.iconSolid : item.icon;
                        return (
                          <>
                            <Icon className="h-[18px] w-[18px] shrink-0" />
                            <span
                              className={cn(
                                "block min-w-0 overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                                collapsed
                                  ? "max-w-0 -translate-x-1 opacity-0"
                                  : "max-w-[200px] translate-x-0 opacity-100",
                              )}
                            >
                              {item.label}
                            </span>
                          </>
                        );
                      }}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="mt-4">
            <div
              className={cn(
                "overflow-hidden transition-[max-height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                collapsed ? "max-h-0 opacity-0" : "max-h-9 opacity-100",
              )}
            >
              <p className="whitespace-nowrap px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">
                Ayuda
              </p>
            </div>
            <NavLink
              to="/soporte"
              title="Soporte"
              aria-label="Soporte"
              className={({ isActive }) =>
                cn(
                  "sidebar-link flex w-full items-center gap-3 rounded-xl py-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  collapsed ? "px-[19px]" : "px-3",
                  isActive
                    ? "bg-sidebar-hover text-sidebar-fg"
                    : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg",
                )
              }
            >
              <LifeBuoy className="h-[18px] w-[18px] shrink-0" />
              <span
                className={cn(
                  "block min-w-0 overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  collapsed
                    ? "max-w-0 -translate-x-1 opacity-0"
                    : "max-w-[200px] translate-x-0 opacity-100",
                )}
              >
                Soporte
              </span>
            </NavLink>
          </div>
        </nav>

        {/* Mini perfil con menú */}
        <div ref={menuRef} className="relative p-3">
          {menuOpen ? (
            <div
              className={cn(
                "anim-pop absolute z-30 rounded-xl bg-[var(--menu)] p-1.5",
                collapsed
                  ? "bottom-2 left-full ml-2 w-56"
                  : "bottom-full left-3 right-3 mb-2",
              )}
              role="menu"
            >
              <ProfileMenuItem
                icon={UsersRound}
                label="Cambiar de cuenta"
                onClick={() => {
                  setMenuOpen(false);
                  setCambiarOpen(true);
                }}
              />
              <ProfileMenuItem
                icon={LogOut}
                label="Cerrar sesión"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmLogout(true);
                }}
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={
              collapsed
                ? `${user.nombre} · ${user.dev ? "Desarrollador" : rolLabel(user.rol)}`
                : undefined
            }
            className={cn(
              "sidebar-link flex w-full items-center gap-3 rounded-xl py-2 text-left outline-none hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              collapsed ? "px-[10px]" : "px-2",
              menuOpen && "bg-sidebar-hover",
            )}
          >
            <span className="relative shrink-0">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-xs font-bold text-accent-fg">
                {initials}
              </span>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400"
                title="Sesión activa"
              />
            </span>
            <span
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-left transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                collapsed
                  ? "max-w-0 -translate-x-1 opacity-0"
                  : "max-w-[170px] translate-x-0 opacity-100",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold leading-tight">
                  {user.nombre}
                </span>
                <span className="mt-0.5 block truncate text-xs text-sidebar-muted">
                  {user.dev ? "Desarrollador" : rolLabel(user.rol)}
                </span>
              </span>
              <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />
            </span>
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {nuevaVersion && user.rol === "admin" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-accent-soft px-5 py-2.5">
            <p className="text-sm font-medium text-accent-fg">
              Nueva versión v{nuevaVersion} disponible.
            </p>
            <Link
              to="/config?tab=sistema"
              className="text-sm font-semibold text-accent-fg underline underline-offset-2 hover:opacity-80"
            >
              Ir a actualizaciones
            </Link>
          </div>
        ) : null}
        <Outlet />
      </main>

      <Modal
        open={cambiarOpen}
        title="Cambiar de cuenta"
        subtitle="Elige el usuario con el que quieres trabajar"
        onClose={() => {
          if (cambiando) return;
          setCambiarOpen(false);
          setClaveCuenta("");
          setErrorCuenta("");
        }}
      >
        {cargandoCuentas ? (
          <p className="flex items-center justify-center gap-2 py-6 text-sm text-fg-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando cuentas…
          </p>
        ) : cuentas.length === 0 && !errorCuenta ? (
          <p className="py-6 text-center text-sm text-fg-muted">
            No hay otras cuentas disponibles.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5" role="radiogroup" aria-label="Cuentas disponibles">
              {cuentas.map((c) => {
                const seleccionada = cuentaSel === c.usuario;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={seleccionada}
                    onClick={() => {
                      setCuentaSel(c.usuario);
                      setClaveCuenta("");
                      setErrorCuenta("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                      seleccionada
                        ? "border-accent bg-accent-soft"
                        : "border-border bg-surface-2 hover:bg-hover",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold text-accent-fg">
                      {iniciales(c.nombre)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold leading-tight text-fg">
                        {c.nombre}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-fg-muted">
                        {c.dev ? "Desarrollador" : rolLabel(c.rol)}
                      </span>
                    </span>
                    {seleccionada ? (
                      <LogIn className="h-4 w-4 shrink-0 text-accent-fg" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {cuentaElegida ? (
              <div>
                <Label htmlFor="cambiar-clave">
                  Contraseña de {cuentaElegida.nombre}
                </Label>
                <Input
                  id="cambiar-clave"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  value={claveCuenta}
                  disabled={cambiando}
                  onChange={(e) => {
                    setClaveCuenta(e.target.value);
                    setErrorCuenta("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void onCambiarCuenta();
                  }}
                  placeholder="••••••••"
                />
              </div>
            ) : null}

            {errorCuenta ? (
              <p role="alert" className="text-sm font-medium text-danger-fg">
                {errorCuenta}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={cambiando}
                onClick={() => {
                  setCambiarOpen(false);
                  setClaveCuenta("");
                  setErrorCuenta("");
                }}
              >
                Cancelar
              </Button>
              <Button
                disabled={!cuentaSel || !claveCuenta || cambiando}
                onClick={() => void onCambiarCuenta()}
              >
                {cambiando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UsersRound className="h-4 w-4" />
                )}
                {cambiando ? "Cambiando…" : "Cambiar cuenta"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={confirmLogout}
        title="Cerrar sesión"
        subtitle="Confirma para salir de la app"
        onClose={() => setConfirmLogout(false)}
      >
        <p className="text-sm text-fg-muted">
          Se cerrará la sesión de <b className="text-fg">{user.nombre}</b>. ¿Deseas
          continuar?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmLogout(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirmLogout(false);
              void onLogout();
            }}
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>
      </Modal>
    </div>
  );
}
