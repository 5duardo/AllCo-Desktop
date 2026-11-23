import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/inter";
import "@fontsource-variable/manrope";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/montserrat";
import App from "./App";
import { SplashWindow } from "./SplashWindow";
import { FullscreenProvider } from "./context/FullscreenContext";
import { WindowFrame } from "./components/layout/WindowFrame";
import { ThemeProvider } from "./context/ThemeContext";
import "./index.css";

// La ventana "splash" muestra el arranque breve; la "main" carga la app.
// En el navegador (sin Tauri) siempre se abre la app.
function esSplash() {
  try {
    return getCurrentWindow().label === "splash";
  } catch {
    return false;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      {esSplash() ? (
        <SplashWindow />
      ) : (
        <FullscreenProvider>
          <WindowFrame>
            <App />
          </WindowFrame>
        </FullscreenProvider>
      )}
    </ThemeProvider>
  </React.StrictMode>,
);
