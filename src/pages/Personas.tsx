import { useSearchParams } from "react-router-dom";
import { Users, UserCog } from "lucide-react";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";
import { EmpleadosPage } from "@/pages/Empleados";
import { UsuariosSection } from "@/pages/Usuarios";

const TABS = [
  { id: "empleados", label: "Empleados", icon: Users },
  { id: "usuarios", label: "Usuarios y permisos", icon: UserCog },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function PersonasPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.find((t) => t.id === params.get("tab"))?.id ?? "empleados";

  function selectTab(id: Tab) {
    setParams(id === "empleados" ? {} : { tab: id }, { replace: true });
  }

  return (
    <div className="page">
      <PageHero
        title="Personas"
        subtitle="Empleados y usuarios del sistema"
        description="Administre la nómina de empleados y las cuentas que ingresan a AllCo, con sus permisos por módulo."
        icon={Users}
      />
      <div className="seg mb-5 flex-wrap" role="group" aria-label="Secciones de personas">
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
      {tab === "empleados" ? <EmpleadosPage sinHero sinPage /> : null}
      {tab === "usuarios" ? <UsuariosSection /> : null}
    </div>
  );
}
