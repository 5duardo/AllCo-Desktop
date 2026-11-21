import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/Login";
import { DashboardPage } from "@/pages/Dashboard";
import { PosPage } from "@/pages/Pos";
import { ClientesPage } from "@/pages/Clientes";
import { InventarioPage } from "@/pages/Inventario";
import { ServiciosPage } from "@/pages/Servicios";
import { ReportesPage } from "@/pages/Reportes";
import { UsuariosPage } from "@/pages/Usuarios";
import { ConfigPage } from "@/pages/Configuracion";
import { StatusPage } from "@/pages/Status";
import { BaseDatosPage } from "@/pages/BaseDatos";
import { PruebasPage } from "@/pages/Pruebas";
import type { Rol } from "@/lib/types";

function GuestOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

function Protected({ roles }: { roles?: Rol[] }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <Outlet />;
}

function DevOnly() {
  const { user } = useAuth();
  if (!user?.dev) return <Navigate to="/" replace />;
  return <Outlet />;
}

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
      <Logo className="anim-pulse h-16 w-16 rounded-2xl" />
      <p className="text-sm font-medium text-fg-muted">Cargando AllCo…</p>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<GuestOnly />} />
          <Route element={<Protected />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route element={<Protected roles={["admin", "caja"]} />}>
                <Route path="/pos" element={<PosPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
              </Route>
              <Route element={<Protected roles={["admin", "bodega"]} />}>
                <Route path="/inventario" element={<InventarioPage />} />
              </Route>
              <Route element={<Protected roles={["admin"]} />}>
                <Route path="/servicios" element={<ServiciosPage />} />
                <Route path="/reportes" element={<ReportesPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
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
    </AuthProvider>
  );
}
