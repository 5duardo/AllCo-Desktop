// Genera latest.json para el actualizador de Tauri a partir del build de NSIS.
// Uso: npm run release:latest-json -- "Notas de la versión"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "5duardo/AllCo-Desktop";
const root = process.cwd();
const conf = JSON.parse(
  readFileSync(join(root, "src-tauri", "tauri.conf.json"), "utf8"),
);
const version = conf.version;
const bundleDir = join(root, "src-tauri", "target", "release", "bundle", "nsis");

if (!existsSync(bundleDir)) {
  console.error("No existe el build NSIS. Ejecute primero: npm run tauri build");
  process.exit(1);
}

const exe = readdirSync(bundleDir).find(
  (f) => f.endsWith(".exe") && !f.endsWith(".sig"),
);
if (!exe) {
  console.error(`No se encontró el instalador .exe en ${bundleDir}`);
  process.exit(1);
}

const sigPath = join(bundleDir, `${exe}.sig`);
if (!existsSync(sigPath)) {
  console.error(
    "Falta la firma .sig. Compile con TAURI_SIGNING_PRIVATE_KEY_PATH configurado.",
  );
  process.exit(1);
}

const signature = readFileSync(sigPath, "utf8").trim();
const notes =
  process.argv.slice(2).join(" ").trim() || `Versión ${version} de AllCo.`;
const url = `https://github.com/${REPO}/releases/download/v${version}/${encodeURIComponent(exe)}`;

const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": { signature, url },
  },
};

const out = join(root, "latest.json");
writeFileSync(out, JSON.stringify(latest, null, 2) + "\n");
console.log(`latest.json generado para v${version}`);
console.log(`  instalador: ${exe}`);
console.log(`  URL: ${url}`);
console.log(`  archivo: ${out}`);
