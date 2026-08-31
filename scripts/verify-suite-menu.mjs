import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || "out");
const chunks = [];

async function collect(directory) {
  for (const name of await readdir(directory)) {
    const absolute = path.join(directory, name);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      await collect(absolute);
      continue;
    }
    if (/\.(?:html|js|mjs)$/i.test(name)) {
      chunks.push(await readFile(absolute, "utf8"));
    }
  }
}

await collect(root);
const bundle = chunks.join("\n");

const required = [
  "Actuaciones y vencimientos",
  "Creador de actuaciones en lote",
  "Creador de Lotes - Actuaciones",
  "Creador de Lotes - Cédulas",
  "Confronte de Liquidaciones EJF",
  "Sistema de Actuaciones Judiciales",
  "biblioteca-judicial-inteligente.arielmarcelogomez7.chatgpt.site",
  "#procesadores",
  "#actuaciones-lote",
  "#lotes-actuaciones",
  "Cedulas-EJE-v1.0",
  "Confronte-Liquidaciones-EJF-v2.1.0",
];

const missing = required.filter((token) => !bundle.includes(token));
if (missing.length) {
  console.error(`El menú SEC29 publicado no contiene: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Menú SEC29 verificado: módulos especializados y acceso unificado IA JUDICIAL presentes.");
