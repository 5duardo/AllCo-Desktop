import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const ACCENTS = [
  { id: "amber", label: "Ámbar", hex: "#f59e0b" },
  { id: "azul", label: "Azul", hex: "#2563eb" },
  { id: "esmeralda", label: "Esmeralda", hex: "#059669" },
  { id: "violeta", label: "Violeta", hex: "#7c3aed" },
  { id: "rosa", label: "Rosa", hex: "#e11d48" },
  { id: "neutro", label: "Neutro", hex: "#08090a" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];
export type ThemeMode = "light" | "dark" | "system";

const MODE_KEY = "allco-theme-mode";
const ACCENT_KEY = "allco-theme-accent";

type ThemeCtx = {
  mode: ThemeMode;
  resolvedMode: "light" | "dark";
  accent: AccentId;
  setMode: (m: ThemeMode) => void;
  setAccent: (a: AccentId) => void;
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readMode);
  const [accent, setAccent] = useState<AccentId>(readAccent);
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
      document.documentElement.dataset.mode = resolved;
      document.documentElement.dataset.accent = accent;
      setResolvedMode(resolved);
    };
    apply();
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(ACCENT_KEY, accent);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode, accent]);

  function toggleMode() {
    setMode(resolvedMode === "dark" ? "light" : "dark");
  }

  return (
    <Ctx.Provider
      value={{ mode, resolvedMode, accent, setMode, setAccent, toggleMode }}
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
