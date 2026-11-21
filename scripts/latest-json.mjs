// Genera latest.json para el actualizador de Tauri a partir de los artefactos
// descargados por GitHub Actions (Windows NSIS + macOS app.tar.gz).
// Uso: node scripts/latest-json.mjs <carpeta-de-artefactos>
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = "5duardo/AllCo-Desktop";
const root = process.cwd();
const dir = process.argv[2] || join(root, "src-tauri", "target", "release", "bundle");
const conf = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
const version = conf.version;

if (!existsSync(dir)) {
  console.error(`No existe la carpeta de artefactos: ${dir}`);
  process.exit(1);
}

function archivos(base) {
  const salida = [];
  for (const nombre of readdirSync(base)) {
    const ruta = join(base, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else salida.push({ nombre, ruta });
  }
  return salida;
}

const todos = archivos(dir);
const windows = todos.find(
  (f) => f.nombre.endsWith(".exe") && !f.nombre.endsWith(".sig") && f.nombre.includes("setup"),
);
const macos = todos.find((f) => f.nombre.endsWith(".app.tar.gz"));

function platform(archivo) {
  if (!archivo) return null;
  const firma = todos.find((f) => f.nombre === `${archivo.nombre}.sig`);
  if (!firma) {
    console.warn(`Sin firma para ${archivo.nombre}; se omite esa plataforma.`);
    return null;
  }
  return {
    signature: readFileSync(firma.ruta, "utf8").trim(),
    url: `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(archivo.nombre)}`,
  };
}

const platforms = {};
const win = platform(windows);
if (win) platforms["windows-x86_64"] = win;
const mac = platform(macos);
if (mac) platforms["darwin-aarch64"] = mac;

if (Object.keys(platforms).length === 0) {
  console.error("No hay artefactos firmados para publicar en latest.json");
  process.exit(1);
}

const latest = {
  version,
  notes: `Versión ${version} de AllCo.`,
  pub_date: new Date().toISOString(),
  platforms,
};

const out = join(root, "latest.json");
writeFileSync(out, JSON.stringify(latest, null, 2) + "\n");
console.log(`latest.json generado para v${version}`);
console.log(`  artefactos: ${Object.keys(platforms).join(", ")}`);
console.log(`  origen: ${relative(root, dir)}`);
