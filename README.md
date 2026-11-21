# AllCo

Tu negocio, bajo control. Inventario, punto de venta y caja para negocios. Sitio: <https://allco.online/>.

App de escritorio Windows, 100% offline: Tauri 2 + React + TypeScript + Tailwind CSS 4 + Rust + SQLite (rusqlite).

## Desarrollo

```bash
npm install
npm run tauri dev
```

Build del frontend: `npm run build`. Instalador: `npm run tauri build`.

## Diseño y temas

- Fuente **DM Sans** (variable), autoalojada vía `@fontsource-variable/dm-sans`: funciona sin internet.
- Logo y favicon en `public/logo.png` (componente `Logo`); foto de fondo del login en `public/login-bg.webp`. Los iconos de la app Tauri se generan con `npx tauri icon public/logo.png`.
- Los colores se definen como variables CSS en `src/index.css` y se consumen como utilidades de Tailwind (`bg-surface`, `text-fg-muted`, `bg-accent`, `text-danger-fg`…). No usar colores fijos (`zinc`, `amber`, `navy`) en las pantallas.
- **Modo claro / oscuro / sistema** y **6 colores de acento** (ámbar, azul, esmeralda, violeta, rosa y neutro: negro en claro, blanco en oscuro). Se eligen en Configuración → Apariencia o con el botón de tema de la barra lateral.
- El estado del tema vive en `src/context/ThemeContext.tsx`, se guarda en `localStorage` y se aplica como `data-mode` / `data-accent` en `<html>`. El script inline de `index.html` evita el parpadeo al arrancar.
- Componentes compartidos: `Button`, `Card`/`Stat`/`Badge`, `Input`/`Select`/`Label`, `Modal`, `Alert`, `PageHeader`, `ThemeControls`. Tablas con la clase `.table`.

## Actualizaciones

En **Configuración → Actualizaciones** se escribe el repositorio de GitHub (`usuario/repositorio` o su URL) y se consulta la última release con la API pública de GitHub. Si la versión publicada es mayor que la instalada, muestra el aviso y abre la página de descarga.

Para actualización automática (descargar e instalar desde la app) hay que añadir `tauri-plugin-updater`, generar el par de llaves de firma, publicar `latest.json` junto a los binarios en GitHub Releases y configurar el endpoint y la llave pública en `tauri.conf.json`.
