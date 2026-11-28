import { useSearchParams } from "react-router-dom";
import { Activity, Database, Download, Settings } from "lucide-react";
import { ActualizacionesSection, PreferenciasSection } from "@/components/SistemaSections";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";
import { StatusPage } from "@/pages/Status";
import { BaseDatosPage } from "@/pages/BaseDatos";

const TABS = [
  { id: "estado", label: "Estado", icon: Activity },
  { id: "preferencias", label: "Preferencias", icon: Settings },
  { id: "datos", label: "Base de datos", icon: Database },
  { id: "actualizaciones", label: "Actualizaciones", icon: Download },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function SistemaPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "estado";

  function selectTab(id: Tab) {
    setParams(id === "estado" ? {} : { tab: id }, { replace: true });
  }

  return (
    <div className="page">
      <PageHero
        title="Sistema"
        subtitle="Estado, preferencias, datos y actualizaciones"
        description="Supervise el estado de la aplicación, ajuste su comportamiento, administre los respaldos y mantenga el programa al día."
        icon={Settings}
      />
      <div className="seg mb-5 flex-wrap" role="group" aria-label="Secciones del sistema">
        {TABS.map((t) => {
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
      {tab === "estado" ? <StatusPage sinHero sinPage /> : null}
      {tab === "preferencias" ? <PreferenciasSection /> : null}
      {tab === "datos" ? <BaseDatosPage sinHero sinPage /> : null}
      {tab === "actualizaciones" ? <ActualizacionesSection /> : null}
    </div>
  );
}
