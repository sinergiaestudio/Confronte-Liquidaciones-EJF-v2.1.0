import { copyFile, mkdir } from "node:fs/promises";

const output = new URL("../public/ocr/", import.meta.url);
await mkdir(output, { recursive: true });

const assets = [
  ["../node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["../node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["../node_modules/tesseract.js-core/tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm"],
  ["../node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz", "spa.traineddata.gz"],
];

await Promise.all(assets.map(([source, destination]) =>
  copyFile(new URL(source, import.meta.url), new URL(destination, output)),
));
