import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { extractPdfText } from "../lib/pdf/extract";
import { parseDocument } from "../lib/parsers/parse-document";

const directory = process.argv[2];
if (!directory) {
  console.error("Uso: npm run audit:pdf -- /ruta/a/pdfs");
  process.exit(64);
}

const files = (await readdir(directory)).filter((file) => file.toLowerCase().endsWith(".pdf")).sort();
const results = [];
for (const fileName of files) {
  const bytes = await readFile(path.join(directory, fileName));
  const file = new File([bytes], fileName, { type: "application/pdf" });
  const extraction = await extractPdfText(file);
  const parsed = parseDocument({ fileName, fileSize: bytes.length, extraction });
  results.push({
    file: fileName,
    mode: extraction.needsOcr ? "necesita OCR" : extraction.mode,
    kind: parsed.kind,
    profile: parsed.profile,
    rows: parsed.rows.length,
    confidence: Math.round(parsed.confidence * 100),
    critical: parsed.issues.filter((issue) => issue.severity === "critical").length,
  });
}
console.table(results);
if (!files.length) process.exitCode = 2;

