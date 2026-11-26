import { ArrowUpRight, LifeBuoy, Mail, MessageCircle } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageHero } from "@/components/layout/PageHero";
import { Card } from "@/components/ui/card";

const WHATSAPP = "https://wa.me/50492561515";
const CORREO = "mailto:info@byhyped.com";

function abrir(url: string) {
  void openUrl(url).catch(() => window.open(url, "_blank", "noopener"));
}

export function SoportePage() {
  return (
    <div className="page">
      <PageHero
        title="Soporte"
        subtitle="Estamos para ayudarte"
        description="Si tiene alguna duda con AllCo o necesita ayuda con la app, escríbanos por cualquiera de estos medios."
        icon={LifeBuoy}
        badge="Contacto"
      />

      <Card className="p-6">
        <h2 className="card-title">Canales de atención</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Elija el medio que le resulte más cómodo. Se abrirá su aplicación de correo o WhatsApp.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => abrir(WHATSAPP)}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-2 p-4 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="icon-chip">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">WhatsApp</span>
              <span className="mt-0.5 block text-sm text-fg-muted">+504 9256 1515</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>

          <button
            type="button"
            onClick={() => abrir(CORREO)}
            className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-2 p-4 text-left outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <span className="icon-chip">
              <Mail className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-fg">Correo</span>
              <span className="mt-0.5 block text-sm text-fg-muted">info@byhyped.com</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-fg-faint" />
          </button>
        </div>
      </Card>
    </div>
  );
}
