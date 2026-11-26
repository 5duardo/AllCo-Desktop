import { useSearchParams } from "react-router-dom";
import { BarChart3, Calculator, Receipt, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";
import { FacturacionPage } from "@/pages/Facturacion";
import { ReportesPage } from "@/pages/Reportes";
import { FinanzasPage } from "@/pages/Finanzas";
import { TalonariosPage } from "@/pages/Talonarios";

const TABS = [
  { id: "facturas", label: "Facturas", icon: Receipt },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
  { id: "finanzas", label: "Finanzas", icon: Wallet },
  { id: "talonarios", label: "Talonarios", icon: Calculator },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function VentasPage() {
  const { user, permisos, tieneAcceso } = useAuth();
  const [params, setParams] = useSearchParams();

  const esAdmin = user?.rol === "admin";
  const verFinanzas = esAdmin || (permisos !== null && tieneAcceso("/finanzas"));
  const visibles = TABS.filter((t) => {
    if (t.id === "finanzas") return verFinanzas;
    if (t.id === "facturas") return true;
    return esAdmin;
  });
  const tab: Tab =
    visibles.find((t) => t.id === params.get("tab"))?.id ?? "facturas";

  function selectTab(id: Tab) {
    setParams(id === "facturas" ? {} : { tab: id }, { replace: true });
  }

  return (
    <div className="page">
      <PageHero
        title="Ventas"
        subtitle="Facturas, reportes, finanzas y talonarios"
        description="Consulte las facturas, analice las ventas, lleve el control de gastos y utilidad, y genere el reporte fiscal de talonarios."
        icon={Receipt}
        badge="Facturación y análisis"
      />
      <div className="seg mb-5 flex-wrap" role="group" aria-label="Secciones de ventas">
        {visibles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={tab === t.id}
              onClick={() => selectTab(t.id)}
              className={cn("seg-item", tab === t.id && "seg-item-active")}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "facturas" ? <FacturacionPage sinHero sinPage /> : null}
      {tab === "reportes" ? <ReportesPage sinHero sinPage /> : null}
      {tab === "finanzas" ? <FinanzasPage sinHero sinPage /> : null}
      {tab === "talonarios" ? <TalonariosPage sinHero sinPage /> : null}
    </div>
  );
}
