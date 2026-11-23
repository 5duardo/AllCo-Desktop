import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  ACCENTS,
  FONTS,
  useTheme,
  type FontId,
  type ThemeMode,
} from "@/context/ThemeContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MODES: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Oscuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

/** Botón compacto claro/oscuro para la barra lateral y el login. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedMode, toggleMode } = useTheme();
  return (
    <Button
      variant="ghost"
      size="iconSm"
      onClick={toggleMode}
      title={resolvedMode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      aria-label="Cambiar tema"
      className={className}
    >
      {resolvedMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export function ThemeModePicker() {
  const { mode, setMode } = useTheme();
  return (
    <div className="seg" role="group" aria-label="Modo de tema">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setMode(m.id)}
          aria-pressed={mode === m.id}
          className={cn("seg-item", mode === m.id && "seg-item-active")}
        >
          <m.icon className="h-4 w-4" />
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Texto (claro u oscuro) que contrasta sobre el color indicado. */
function contraste(hex: string) {
  const limpio = hex.replace("#", "");
  const completo =
    limpio.length === 3
      ? limpio
          .split("")
          .map((c) => c + c)
          .join("")
      : limpio;
  const r = parseInt(completo.slice(0, 2), 16) / 255;
  const g = parseInt(completo.slice(2, 4), 16) / 255;
  const b = parseInt(completo.slice(4, 6), 16) / 255;
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luz > 0.6 ? "#111827" : "#ffffff";
}

export function AccentPicker() {
  const { accent, resolvedMode, setAccent } = useTheme();
  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Color del tema">
      {ACCENTS.map((a) => {
        const bg = resolvedMode === "dark" ? a.hexDark : a.hex;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => setAccent(a.id)}
            title={a.label}
            aria-label={`Tema ${a.label}`}
            aria-pressed={accent === a.id}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-xl transition-all hover:scale-105",
              accent === a.id && "scale-105",
            )}
            style={{ backgroundColor: bg, color: contraste(bg) }}
          >
            {accent === a.id ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function FontPicker() {
  const { font, setFont } = useTheme();
  const elegir = (id: FontId) => setFont(id);

  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Tipografía">
      {FONTS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => elegir(f.id)}
          aria-pressed={font === f.id}
          title={f.label}
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
            font === f.id
              ? "border-accent bg-accent-soft"
              : "border-border bg-surface-2 hover:bg-hover",
          )}
          style={{ fontFamily: f.stack }}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">{f.label}</span>
            <span className="mt-0.5 block truncate text-xs text-fg-muted">
              Aa Bb Cc · 0123
            </span>
          </span>
          {font === f.id ? (
            <Check className="h-4 w-4 shrink-0 text-accent-fg" strokeWidth={3} />
          ) : null}
        </button>
      ))}
    </div>
  );
}
