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
- **Modo claro / oscuro / sistema** y **6 colores de acento** (ámbar, azul, esmeralda, violeta, rosa y neutro: negro en claro, blanco en oscuro). El acento por defecto es **Neutro**. Se eligen en Configuración → Apariencia o con el botón de tema de la barra lateral.
- El estado del tema vive en `src/context/ThemeContext.tsx`, se guarda en `localStorage` y se aplica como `data-mode` / `data-accent` en `<html>`. El script inline de `index.html` evita el parpadeo al arrancar.
- Componentes compartidos: `Button`, `Card`/`Stat`/`Badge`, `Input`/`Select`/`Label`, `Modal`, `Alert`, `PageHeader`, `ThemeControls`. Tablas con la clase `.table`.

## Actualizaciones

La app usa `tauri-plugin-updater` con GitHub Releases del repositorio **5duardo/AllCo-Desktop**:

- Al abrir, busca automáticamente una versión nueva y muestra un aviso al administrador.
- En **Configuración → Actualizaciones** se puede buscar, descargar e instalar, y reiniciar la app.
- Endpoint: `https://github.com/5duardo/AllCo-Desktop/releases/latest/download/latest.json`.

### Publicar una versión

1. Suba la versión en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
2. Compile firmando los artefactos:

   ```powershell
   $env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\allco.key"
   npm run tauri build
   npm run release:latest-json -- "Notas de la versión"
   ```

3. Cree una release en GitHub con etiqueta `vX.Y.Z` y suba:
   - `src-tauri/target/release/bundle/nsis/AllCo_X.Y.Z_x64-setup.exe`
   - `latest.json` (generado en la raíz del proyecto)
   - opcionalmente el `.sig` del instalador.

La llave privada de firma está fuera del repositorio, en `%USERPROFILE%\.tauri\allco.key`. Consérvela y respáldela: sin ella no se pueden firmar actualizaciones. No la suba al repositorio.

> La llave se generó sin contraseña por simplicidad. Para producción conviene regenerarla con contraseña y usarla solo en un entorno seguro o en GitHub Actions.
