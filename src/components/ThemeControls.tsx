import { Check, Monitor, Moon, Sun } from "lucide-react";
import { ACCENTS, useTheme, type ThemeMode } from "@/context/ThemeContext";
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

export function AccentPicker() {
  const { accent, resolvedMode, setAccent } = useTheme();
  return (
    <div className="flex flex-wrap gap-2.5" role="group" aria-label="Color del tema">
      {ACCENTS.map((a) => {
        const neutro = a.id === "neutro";
        const bg = neutro ? (resolvedMode === "dark" ? "#f3f4f6" : "#08090a") : a.hex;
        const fg =
          a.id === "amber" || (neutro && resolvedMode === "dark") ? "#111827" : "#ffffff";
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
            style={{ backgroundColor: bg, color: fg }}
          >
            {accent === a.id ? <Check className="h-5 w-5" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}
