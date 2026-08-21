import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ExtractionResult } from "../lib/domain/types";
import { parseDocument } from "../lib/parsers/parse-document";

const directory = process.argv[2];
if (!directory) {
  console.error("Uso: npm run audit:corpus -- /ruta/a/textos-extraidos");
  process.exit(64);
}

const files = (await readdir(directory)).filter((file) => file.endsWith(".txt")).sort();
const results = [];
for (const file of files) {
  const text = await readFile(path.join(directory, file), "utf8");
  const extraction: ExtractionResult = {
    pages: text.split("\f").map((pageText, index) => ({
      pageNumber: index + 1,
      text: pageText,
      characterCount: pageText.replace(/\s/g, "").length,
      source: "texto",
    })),
    text,
    mode: "texto",
    needsOcr: text.replace(/\s/g, "").length < 120,
    quality: text.replace(/\s/g, "").length < 120 ? 0.05 : 0.95,
    fingerprint: `audit-${file}`,
  };
  const parsed = parseDocument({ fileName: file.replace(/\.txt$/, ".pdf"), fileSize: 0, extraction });
  results.push({
    file,
    kind: parsed.kind,
    profile: parsed.profile,
    rows: parsed.rows.length,
    confidence: Math.round(parsed.confidence * 100),
    critical: parsed.issues.filter((issue) => issue.severity === "critical").length,
  });
}
console.table(results);
if (!files.length) process.exitCode = 2;

