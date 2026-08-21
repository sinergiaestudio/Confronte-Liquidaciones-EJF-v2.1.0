import { clamp, stableId } from "../domain/normalize";
import type { ExtractedPage, ExtractionResult } from "../domain/types";

export type ExtractionProgress = (message: string, progress: number) => void;

interface PositionedText {
  text: string;
  x: number;
  y: number;
}

function rebuildLines(items: PositionedText[]): string {
  const lines: Array<{ y: number; items: PositionedText[] }> = [];
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3.2);
    if (line) {
      line.items.push(item);
      line.y = (line.y + item.y) / 2;
    } else {
      lines.push({ y: item.y, items: [item] });
    }
  }
  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => line.items.sort((left, right) => left.x - right.x).map((item) => item.text).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function fingerprint(bytes: Uint8Array): string {
  const sample = bytes.length > 12_000 ? bytes.slice(0, 12_000) : bytes;
  return stableId(bytes.length, ...sample.filter((_, index) => index % 113 === 0));
}

export async function extractPdfText(file: File, onProgress?: ExtractionProgress): Promise<ExtractionResult> {
  onProgress?.("Abriendo el PDF", 0.05);
  const isNode = typeof window === "undefined";
  const pdfjs = isNode ? await import("pdfjs-dist/legacy/build/pdf.mjs") : await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = isNode
    ? import.meta.resolve("pdfjs-dist/legacy/build/pdf.worker.min.mjs")
    : new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileFingerprint = fingerprint(bytes);
  const pdf = await pdfjs.getDocument({
    data: bytes,
    // Node audits only need the text layer; missing render fonts are not actionable there.
    ...(isNode ? { verbosity: 0 } : {}),
  }).promise;
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.(`Leyendo página ${pageNumber} de ${pdf.numPages}`, 0.08 + (pageNumber / pdf.numPages) * 0.72);
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items: PositionedText[] = content.items.flatMap((item) => {
      if (!("str" in item) || !item.str.trim()) return [];
      return [{ text: item.str, x: item.transform[4], y: item.transform[5] }];
    });
    const text = rebuildLines(items);
    pages.push({ pageNumber, text, characterCount: text.replace(/\s/g, "").length, source: "texto" });
  }

  const text = pages.map((page) => page.text).join("\n\f\n");
  const usefulPages = pages.filter((page) => page.characterCount >= 80).length;
  const totalCharacters = pages.reduce((sum, page) => sum + page.characterCount, 0);
  const quality = clamp((usefulPages / Math.max(1, pages.length)) * 0.65 + Math.min(1, totalCharacters / Math.max(300, pages.length * 650)) * 0.35);
  const needsOcr = usefulPages < Math.ceil(pages.length * 0.6) || totalCharacters < 120;
  onProgress?.(needsOcr ? "El archivo necesita OCR local" : "Texto reconstruido", 1);
  return {
    pages,
    text,
    mode: "texto",
    needsOcr,
    quality,
    fingerprint: fileFingerprint,
  };
}

export async function extractPdfWithOcr(file: File, onProgress?: ExtractionProgress): Promise<ExtractionResult> {
  onProgress?.("Preparando el reconocimiento óptico", 0.02);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const { createWorker } = await import("tesseract.js");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileFingerprint = fingerprint(bytes);
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  let currentPage = 0;
  const makeWorker = async () => createWorker("spa", undefined, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/tesseract-core-lstm.wasm.js",
    langPath: "/ocr",
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") {
        const overall = 0.08 + ((currentPage + message.progress) / pdf.numPages) * 0.88;
        onProgress?.(`OCR local · página ${currentPage + 1} de ${pdf.numPages}`, overall);
      }
    },
  });
  const worker = await makeWorker();
  const pages: ExtractedPage[] = [];
  try {
    for (currentPage = 0; currentPage < pdf.numPages; currentPage += 1) {
      const page = await pdf.getPage(currentPage + 1);
      const viewport = page.getViewport({ scale: 3 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("No se pudo crear el lienzo para OCR.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo rasterizar la página.")), "image/png"),
      );
      const result = await worker.recognize(blob);
      const text = result.data.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      pages.push({ pageNumber: currentPage + 1, text, characterCount: text.replace(/\s/g, "").length, source: "ocr" });
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await worker.terminate();
  }
  const text = pages.map((page) => page.text).join("\n\f\n");
  const totalCharacters = pages.reduce((sum, page) => sum + page.characterCount, 0);
  const quality = clamp(0.42 + Math.min(0.45, totalCharacters / Math.max(1, pages.length * 1600)));
  onProgress?.("OCR terminado; revise los valores marcados", 1);
  return {
    pages,
    text,
    mode: "ocr",
    needsOcr: false,
    quality,
    fingerprint: fileFingerprint,
  };
}
