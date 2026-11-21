import { useEffect, useState } from "react";
import {
  Database,
  FlaskConical,
  Package,
  Receipt,
  Users,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import type { EstadoPruebas } from "@/lib/types";
import { Alert } from "@/components/ui/alert";
import { PageHero } from "@/components/layout/PageHero";
import { Button } from "@/components/ui/button";
import { Card, Stat } from "@/components/ui/card";

const TIPOS = [
  { id: "todo", label: "Agregar todo" },
  { id: "productos", label: "Productos" },
  { id: "servicios", label: "Servicios" },
  { id: "clientes", label: "Clientes" },
  { id: "ventas", label: "Ventas" },
];

export function PruebasPage() {
  const [estado, setEstado] = useState<EstadoPruebas | null>(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.estadoPruebas().then(setEstado).catch((e) => setError(String(e)));
  }, []);

  async function agregar(tipo: string) {
    setBusy(tipo);
    setError("");
    setMsg("");
    try {
      const nuevo = await api.agregarDatosEjemplo(tipo);
      setEstado(nuevo);
      setMsg(
        tipo === "todo"
          ? "Datos de ejemplo agregados."
          : `Datos de ejemplo (${tipo}) agregados.`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="page">
      <PageHero
        title="Pruebas"
        subtitle="Datos de ejemplo y herramientas de desarrollo"
        description="Herramientas exclusivas del usuario de desarrollo para poblar la app con productos, servicios, clientes y ventas de ejemplo."
        icon={FlaskConical}
        badge="Solo desarrollador"
      />
      {error ? <Alert>{error}</Alert> : null}
      {msg ? <Alert tone="ok">{msg}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Productos"
          value={estado?.productos ?? 0}
          icon={<Package className="h-5 w-5" />}
        />
        <Stat
          label="Servicios"
          value={estado?.servicios ?? 0}
          icon={<Wrench className="h-5 w-5" />}
        />
        <Stat
          label="Clientes"
          value={estado?.clientes ?? 0}
          icon={<Users className="h-5 w-5" />}
        />
        <Stat
          label="Ventas"
          value={estado?.ventas ?? 0}
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      <Card className="mt-5 p-6">
        <h2 className="card-title flex items-center gap-2">
          <Database className="h-4 w-4 text-accent-fg" />
          Agregar datos de ejemplo
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          Se agregan sin borrar lo que ya existe. Los productos usan SKU
          <b className="text-fg"> DEMO-…</b>, los clientes se llaman “Cliente de
          ejemplo” y las ventas descuentan stock real.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <Button
              key={t.id}
              variant={t.id === "todo" ? "default" : "secondary"}
              onClick={() => agregar(t.id)}
              disabled={!!busy}
            >
              {busy === t.id ? "Agregando…" : t.label}
            </Button>
          ))}
        </div>
        <p className="mt-4 text-xs text-fg-faint">
          Los datos demo se pueden editar o desactivar desde Inventario, Servicios
          y Clientes.
        </p>
      </Card>
    </div>
  );
}
