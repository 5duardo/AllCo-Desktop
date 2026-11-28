import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/** Los acentos de color son iguales en claro y oscuro. Neutro se adapta al modo. */
export const ACCENTS = [
  { id: "neutro", label: "Neutro", hex: "#08090a", hexDark: "#f3f4f6" },
  { id: "amber", label: "Ámbar", hex: "#f59e0b", hexDark: "#f59e0b" },
  { id: "azul", label: "Azul", hex: "#2563eb", hexDark: "#2563eb" },
  { id: "esmeralda", label: "Esmeralda", hex: "#059669", hexDark: "#059669" },
  { id: "violeta", label: "Violeta", hex: "#7c3aed", hexDark: "#7c3aed" },
  { id: "rosa", label: "Rosa", hex: "#e11d48", hexDark: "#e11d48" },
  { id: "turquesa", label: "Turquesa", hex: "#0d9488", hexDark: "#0d9488" },
  { id: "naranja", label: "Naranja", hex: "#ea580c", hexDark: "#ea580c" },
  { id: "rojo", label: "Rojo", hex: "#dc2626", hexDark: "#dc2626" },
  { id: "indigo", label: "Índigo", hex: "#4f46e5", hexDark: "#4f46e5" },
  { id: "cian", label: "Cian", hex: "#0891b2", hexDark: "#0891b2" },
  { id: "lima", label: "Lima", hex: "#65a30d", hexDark: "#65a30d" },
] as const;

export const FONTS = [
  { id: "dm-sans", label: "DM Sans", stack: '"DM Sans Variable", "DM Sans", system-ui, sans-serif' },
  { id: "inter", label: "Inter", stack: '"Inter Variable", "Inter", system-ui, sans-serif' },
  { id: "manrope", label: "Manrope", stack: '"Manrope Variable", "Manrope", system-ui, sans-serif' },
  {
    id: "jakarta",
    label: "Plus Jakarta Sans",
    stack: '"Plus Jakarta Sans Variable", "Plus Jakarta Sans", system-ui, sans-serif',
  },
  {
    id: "montserrat",
    label: "Montserrat",
    stack: '"Montserrat Variable", "Montserrat", system-ui, sans-serif',
  },
  { id: "sistema", label: "Sistema", stack: "system-ui, -apple-system, \"Segoe UI\", sans-serif" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type FontId = (typeof FONTS)[number]["id"];
export type ThemeMode = "light" | "dark" | "system";

const MODE_KEY = "allco-theme-mode";
const ACCENT_KEY = "allco-theme-accent";
const FONT_KEY = "allco-theme-font";

type ThemeCtx = {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  accent: AccentId;
  font: FontId;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
  setFont: (f: FontId) => void;
  toggleMode: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function readMode(): ThemeMode {
  const v = localStorage.getItem(MODE_KEY);
  return v === "dark" || v === "system" || v === "light" ? v : "light";
}

function readAccent(): AccentId {
  // Migración única: el acento por defecto ahora es Neutro.
  if (!localStorage.getItem("allco-default-neutral")) {
    localStorage.setItem("allco-default-neutral", "1");
    const actual = localStorage.getItem(ACCENT_KEY);
    if (!actual || actual === "amber") {
      localStorage.setItem(ACCENT_KEY, "neutro");
    }
  }
  const v = localStorage.getItem(ACCENT_KEY);
  return ACCENTS.some((a) => a.id === v) ? (v as AccentId) : "neutro";
}

function readFont(): FontId {
  const v = localStorage.getItem(FONT_KEY);
  return FONTS.some((f) => f.id === v) ? (v as FontId) : "dm-sans";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const [accent, setAccent] = useState<AccentId>(readAccent);
  const [font, setFont] = useState<FontId>(readFont);
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
      document.documentElement.dataset.mode = resolved;
      document.documentElement.dataset.accent = accent;
      document.documentElement.dataset.font = font;
      setResolvedMode(resolved);
    };
    apply();
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
    localStorage.setItem(FONT_KEY, font);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, accent, font]);

  function toggleMode() {
    setMode(resolvedMode === "dark" ? "light" : "dark");
  }

  return (
    <Ctx.Provider
      value={{ mode, resolvedMode, accent, font, setMode, setAccent, setFont, toggleMode }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme fuera de ThemeProvider");
  return ctx;
}
