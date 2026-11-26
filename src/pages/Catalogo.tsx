import { useSearchParams } from "react-router-dom";
import { Package, Truck, Wrench } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { PageHero } from "@/components/layout/PageHero";
import { cn } from "@/lib/utils";
import { InventarioPage } from "@/pages/Inventario";
import { ServiciosPage } from "@/pages/Servicios";
import { ProveedoresPage } from "@/pages/Proveedores";

const TABS = [
  { id: "productos", label: "Productos", icon: Package },
  { id: "servicios", label: "Servicios", icon: Wrench },
  { id: "proveedores", label: "Proveedores", icon: Truck },
] as const;

type Tab = (typeof TABS)[number]["id"];

export function CatalogoPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const visibles = TABS.filter(
    (t) => t.id !== "servicios" || user?.rol === "admin",
  );
  const tab: Tab =
    visibles.find((t) => t.id === params.get("tab"))?.id ?? "productos";

  function selectTab(id: Tab) {
    setParams(id === "productos" ? {} : { tab: id }, { replace: true });
  }

  return (
    <div className="page">
      <PageHero
        title="Catálogo"
        subtitle="Productos, servicios y proveedores"
        description="Administre lo que vende y a quién le compra: productos e inventario, servicios y proveedores, todo en un mismo lugar."
        icon={Package}
        badge="Inventario y servicios"
      />
      <div className="seg mb-5 flex-wrap" role="group" aria-label="Secciones del catálogo">
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
      {tab === "productos" ? <InventarioPage sinHero sinPage /> : null}
      {tab === "servicios" ? <ServiciosPage sinHero sinPage /> : null}
      {tab === "proveedores" ? <ProveedoresPage sinHero sinPage /> : null}
    </div>
  );
}
