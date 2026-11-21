import { useEffect, useRef, useState, type ComponentType } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  ChevronsUpDown,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
} from "lucide-react";
import {
  ChartBarIcon,
  Cog6ToothIcon,
  CubeIcon,
  HomeIcon,
  ShoppingCartIcon,
  SignalIcon,
  UsersIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";
import {
  ChartBarIcon as ChartBarSolidIcon,
  Cog6ToothIcon as Cog6ToothSolidIcon,
  CubeIcon as CubeSolidIcon,
  HomeIcon as HomeSolidIcon,
  ShoppingCartIcon as ShoppingCartSolidIcon,
  SignalIcon as SignalSolidIcon,
  UsersIcon as UsersSolidIcon,
  WrenchIcon as WrenchSolidIcon,
} from "@heroicons/react/24/solid";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { Logo } from "@/components/Logo";
import { rolLabel } from "@/lib/format";
import type { Rol } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavIcon = ComponentType<{ className?: string }>;

const NAV: {
  to: string;
  label: string;
  icon: NavIcon;
  iconSolid: NavIcon;
  roles: Rol[];
}[] = [
  { to: "/", label: "Inicio", icon: HomeIcon, iconSolid: HomeSolidIcon, roles: ["admin", "caja", "bodega"] },
  { to: "/pos", label: "Caja", icon: ShoppingCartIcon, iconSolid: ShoppingCartSolidIcon, roles: ["admin", "caja"] },
  { to: "/inventario", label: "Inventario", icon: CubeIcon, iconSolid: CubeSolidIcon, roles: ["admin", "bodega"] },
  { to: "/servicios", label: "Servicios", icon: WrenchIcon, iconSolid: WrenchSolidIcon, roles: ["admin"] },
  { to: "/reportes", label: "Reportes", icon: ChartBarIcon, iconSolid: ChartBarSolidIcon, roles: ["admin"] },
  { to: "/usuarios", label: "Usuarios", icon: UsersIcon, iconSolid: UsersSolidIcon, roles: ["admin"] },
  { to: "/status", label: "Status de uso", icon: SignalIcon, iconSolid: SignalSolidIcon, roles: ["admin"] },
  { to: "/config", label: "Configuración", icon: Cog6ToothIcon, iconSolid: Cog6ToothSolidIcon, roles: ["admin"] },
];

const COLLAPSE_KEY = "sic-sidebar-collapsed";

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
  const { user, logout } = useAuth();
  const { accent, resolvedMode, toggleMode } = useTheme();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

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

  if (!user) return null;

  async function onLogout() {
    await logout();
    navigate("/login");
  }

  // Cierra la sesión y vuelve al login para entrar con otra cuenta.
  async function onSwitchUser() {
    await logout();
    navigate("/login");
  }

  const items = NAV.filter((n) => n.roles.includes(user.rol));
  // El acento neutro es negro en tema claro: sobre el sidebar oscuro
  // necesita un fondo translúcido para que el ítem activo se distinga.
  const neutralOnDarkSidebar = accent === "neutro" && resolvedMode === "light";
  const initials = user.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <aside
        className={cn(
          "relative z-10 flex shrink-0 flex-col bg-sidebar text-sidebar-fg transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          collapsed ? "w-20" : "w-64",
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-expanded={!collapsed}
          className="absolute -right-3.5 top-7 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-surface text-fg-muted outline-none transition-all hover:scale-110 hover:text-accent-fg focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftClose className="h-3.5 w-3.5" />
          )}
        </button>

        <div
          className={cn(
            "flex items-center gap-3 px-5 py-5",
            collapsed && "justify-center px-2",
          )}
        >
          <Logo className="h-11 w-11" />
          <div
            className={cn(
              "min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-all duration-200",
              collapsed && "pointer-events-none w-0 flex-none opacity-0",
            )}
          >
            <p className="truncate text-base font-bold leading-tight">AllCo</p>
            <p className="truncate text-xs text-sidebar-muted">Inventario y caja</p>
          </div>
        </div>

        <nav
          className={cn("flex-1 space-y-1 overflow-y-auto p-3", collapsed && "px-2.5")}
          aria-label="Menú principal"
        >
          {!collapsed ? (
            <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">
              Menú
            </p>
          ) : (
            <div className="mx-auto mb-3 h-1 w-8 rounded-full bg-sidebar-border" />
          )}
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                  collapsed && "justify-center gap-0 px-2 py-3",
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
                        "truncate whitespace-nowrap transition-all duration-200",
                        collapsed && "w-0 -translate-x-1 opacity-0",
                      )}
                    >
                      {item.label}
                    </span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </nav>

        {/* Mini perfil con menú */}
        <div
          ref={menuRef}
          className={cn("relative p-3", collapsed && "px-2")}
        >
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
                icon={ArrowLeftRight}
                label="Cambiar de usuario"
                onClick={() => {
                  setMenuOpen(false);
                  onSwitchUser();
                }}
              />
              <ProfileMenuItem
                icon={resolvedMode === "dark" ? Sun : Moon}
                label={resolvedMode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                onClick={() => {
                  toggleMode();
                  setMenuOpen(false);
                }}
              />
              <div className="mx-2 my-1 h-px bg-[var(--menu-hover)]" />
              <ProfileMenuItem
                icon={LogOut}
                label="Cerrar sesión"
                danger
                onClick={() => {
                  setMenuOpen(false);
                  onLogout();
                }}
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={collapsed ? `${user.nombre} · ${rolLabel(user.rol)}` : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left outline-none transition-colors hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              collapsed && "justify-center px-0",
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
            {!collapsed ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {user.nombre}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-sidebar-muted">
                    {rolLabel(user.rol)}
                  </span>
                </span>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted" />
              </>
            ) : null}
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
