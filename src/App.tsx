import { useEffect } from "react";
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import { UpdateProvider } from "@/context/UpdateContext";
import { Logo } from "@/components/Logo";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { PosPage } from "@/pages/Pos";
import { ClientesPage } from "@/pages/Clientes";
import { DispositivosPage } from "@/pages/Dispositivos";
import { ConfigPage } from "@/pages/Configuracion";
import { PruebasPage } from "@/pages/Pruebas";
import { CatalogoPage } from "@/pages/Catalogo";
import { FacturacionPage } from "@/pages/Facturacion";
import { ReportesPage } from "@/pages/Reportes";
import { FinanzasPage } from "@/pages/Finanzas";
import { TalonariosPage } from "@/pages/Talonarios";
import { PersonasPage } from "@/pages/Personas";
import { SistemaPage } from "@/pages/Sistema";
import { SoportePage } from "@/pages/Soporte";
import { leerMinimizarAlCerrar } from "@/lib/window";
import type { Rol } from "@/lib/types";

function GuestOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function Protected({ roles }: { roles?: Rol[] }) {
  const { user, ready, permisos, tieneAcceso } = useAuth();
  const { pathname } = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  // Configuración sigue siendo exclusiva de administrador.
  if (pathname === "/config" && user.rol !== "admin") return <Navigate to="/" replace />;
  // Con permisos personalizados, la lista marcada reemplaza al rol.
  if (roles && permisos === null && !roles.includes(user.rol)) {
    return <Navigate to="/" replace />;
  }
  // Soporte es un enlace de ayuda para todos los usuarios, no un módulo configurable.
  const exento =
    pathname === "/soporte" ||
    pathname === "/usuarios" ||
    pathname === "/pruebas";
  if (permisos !== null && !exento && !tieneAcceso(pathname)) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function DevOnly() {
  const { user } = useAuth();
  if (!user?.dev) return <Navigate to="/" replace />;
  return <Outlet />;
}

// Finanzas la ve el administrador o quien tenga el permiso personalizado.
function AccesoFinanzas() {
  const { user, permisos, tieneAcceso } = useAuth();
  if (user?.rol === "admin") return <Outlet />;
  if (permisos !== null && tieneAcceso("/finanzas")) return <Outlet />;
  return <Navigate to="/" replace />;
}

function Splash() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg">
      <Logo className="anim-pulse h-16 w-16 rounded-2xl" />
      <p className="flex items-center gap-2 text-sm font-medium text-fg-muted">
        Cargando AllCo…
        <Loader2 className="h-4 w-4 animate-spin" />
      </p>
    </div>
  );
}

// La X de la ventana minimiza la app si la preferencia está activa (por defecto).
function useCerrarMinimizando() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelado = false;
    try {
      getCurrentWindow()
        .onCloseRequested((event) => {
          if (!leerMinimizarAlCerrar()) return;
          event.preventDefault();
          void getCurrentWindow().minimize();
        })
        .then((f) => {
          if (cancelado) f();
          else unlisten = f;
        })
        .catch(() => {});
    } catch {
      // Sin Tauri (navegador) no hay ventana que interceptar.
    }
    return () => {
      cancelado = true;
      unlisten?.();
    };
  }, []);
}

export default function App() {
  useCerrarMinimizando();

  return (
    <ToastProvider>
      <AuthProvider>
        <UpdateProvider>
          <HashRouter>
            <Routes>
              <Route path="/login" element={<GuestOnly />} />
              <Route element={<Protected />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/soporte" element={<SoportePage />} />
                  <Route element={<Protected roles={["admin", "caja"]} />}>
                    <Route path="/pos" element={<PosPage />} />
                    <Route path="/clientes" element={<ClientesPage />} />
                    <Route path="/dispositivos" element={<DispositivosPage />} />
                    <Route path="/facturacion" element={<FacturacionPage />} />
                    <Route element={<AccesoFinanzas />}>
                      <Route path="/finanzas" element={<FinanzasPage />} />
                    </Route>
                  </Route>
                  <Route element={<Protected roles={["admin", "bodega"]} />}>
                    <Route path="/catalogo" element={<CatalogoPage />} />
                  </Route>
                  <Route element={<Protected roles={["admin"]} />}>
                    <Route path="/reportes" element={<ReportesPage />} />
                    <Route path="/talonarios" element={<TalonariosPage />} />
                    <Route path="/personas" element={<PersonasPage />} />
                    <Route path="/sistema" element={<SistemaPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route element={<DevOnly />}>
                      <Route path="/pruebas" element={<PruebasPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
              {/* Ruta anterior: Ventas se abrió en cuatro páginas propias. */}
              <Route path="/ventas" element={<Navigate to="/facturacion" replace />} />
              <Route path="/inventario" element={<Navigate to="/catalogo?tab=productos" replace />} />
              <Route path="/servicios" element={<Navigate to="/catalogo?tab=servicios" replace />} />
              <Route path="/proveedores" element={<Navigate to="/catalogo?tab=proveedores" replace />} />
              <Route path="/empleados" element={<Navigate to="/personas?tab=empleados" replace />} />
              <Route path="/usuarios" element={<Navigate to="/personas?tab=usuarios" replace />} />
              <Route path="/status" element={<Navigate to="/sistema?tab=estado" replace />} />
              <Route path="/base-datos" element={<Navigate to="/sistema?tab=datos" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </UpdateProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
