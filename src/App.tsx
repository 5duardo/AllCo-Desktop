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
import { EmpleadosPage } from "@/pages/Empleados";
import { InventarioPage } from "@/pages/Inventario";
import { DispositivosPage } from "@/pages/Dispositivos";
import { ServiciosPage } from "@/pages/Servicios";
import { ReportesPage } from "@/pages/Reportes";
import { ConfigPage } from "@/pages/Configuracion";
import { StatusPage } from "@/pages/Status";
import { BaseDatosPage } from "@/pages/BaseDatos";
import { PruebasPage } from "@/pages/Pruebas";
import { ProveedoresPage } from "@/pages/Proveedores";
import { FacturacionPage } from "@/pages/Facturacion";
import { TalonariosPage } from "@/pages/Talonarios";
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
  const exento = pathname === "/usuarios" || pathname === "/pruebas";
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
                  <Route element={<Protected roles={["admin", "caja"]} />}>
                    <Route path="/pos" element={<PosPage />} />
                    <Route path="/facturacion" element={<FacturacionPage />} />
                    <Route path="/clientes" element={<ClientesPage />} />
                    <Route path="/dispositivos" element={<DispositivosPage />} />
                  </Route>
                  <Route element={<Protected roles={["admin", "bodega"]} />}>
                    <Route path="/inventario" element={<InventarioPage />} />
                    <Route path="/proveedores" element={<ProveedoresPage />} />
                  </Route>
                  <Route element={<Protected roles={["admin"]} />}>
                    <Route path="/servicios" element={<ServiciosPage />} />
                    <Route path="/reportes" element={<ReportesPage />} />
                    <Route path="/talonarios" element={<TalonariosPage />} />
                    <Route path="/empleados" element={<EmpleadosPage />} />
                    <Route path="/usuarios" element={<Navigate to="/config?tab=usuarios" replace />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route path="/status" element={<StatusPage />} />
                    <Route path="/base-datos" element={<BaseDatosPage />} />
                    <Route element={<DevOnly />}>
                      <Route path="/pruebas" element={<PruebasPage />} />
                    </Route>
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </UpdateProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
