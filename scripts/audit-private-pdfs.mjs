// Desde la raíz del repositorio: node --import tsx scripts/audit-private-pdfs.mjs /ruta/al/paquete-extraido
// Los documentos y sus resultados de referencia permanecen fuera del repositorio.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const directory = process.argv[2];
if (!directory) throw new Error("Falta el directorio del paquete de regresión descomprimido.");
const loadModule = (name) => import(pathToFileURL(path.resolve(name)).href);
const { extractPdfText } = await loadModule("lib/pdf/extract.ts");
const { parseDocument } = await loadModule("lib/parsers/parse-document.ts");
const { pairDocuments } = await loadModule("lib/confronte/pairing.ts");
const { recalculatePair } = await loadModule("lib/confronte/calculate.ts");
const { canonicalDocumentId, roundMoney } = await loadModule("lib/domain/normalize.ts");
const expected = JSON.parse(await readFile(path.join(directory, "03_DESARROLLO", "CASO_ESPERADO.json"), "utf8"));

async function readPdf(section, prefix) {
  const folder = path.join(directory, section);
  const names = (await readdir(folder)).filter(name => name.startsWith(prefix) && name.endsWith(".pdf"));
  assert.equal(names.length, 1, "Se esperaba un único PDF para " + prefix);
  const file = new File([await readFile(path.join(folder, names[0]))], "documento.pdf", {type:"application/pdf"});
  const extraction = await extractPdfText(file);
  return parseDocument({fileName:file.name, fileSize:file.size, extraction});
}

const certificate = await readPdf("01_FUENTES", "CERTIFICADO");
const variants = [
  ["Anexo íntegro", await readPdf("01_FUENTES", "PLANILLA_ANEXA"), 4, 1],
  ["Anexo de diagnóstico", await readPdf("03_DESARROLLO", "PLANILLA_SOLO"), 2, 1],
  ["Escrito con anexo", await readPdf("01_FUENTES", "LIQUIDACION_ESCRITO"), 10, 7],
];

function invoiceOf(doc, expectedRow) {
  const row = doc.rows.find(row => row.key === canonicalDocumentId(expectedRow.id));
  assert.ok(row, "Debe existir un renglón para cada comprobante del resultado de referencia");
  assert.equal(row.presentationDate, expectedRow.fecha);
  assert.equal(row.dueDate, expectedRow.mora);
  assert.equal(row.capital, Number(expectedRow.capital));
  return row;
}

test("Certificado con hoja de firma, fecha de corte y deuda certificada", () => {
  assert.equal(certificate.extraction.pages.length, 2);
  assert.equal(certificate.extraction.needsOcr, false);
  assert.equal(certificate.kind, "constancia");
  assert.equal(certificate.profile, "capitalizacion_facturas");
  assert.equal(certificate.metadata.certificate, expected.certificado.numero);
  assert.equal(certificate.metadata.interestCutoffDate, expected.certificado.fecha_calculo);
  assert.equal(certificate.metadata.declaredTotal, Number(expected.certificado.total_certificado));
  assert.equal(certificate.rows.length, expected.facturas.length);
  for (const expectedRow of expected.facturas) {
    const row = invoiceOf(certificate, expectedRow);
    assert.equal(row.resarcitorio, Number(expectedRow.intereses_certificado));
    assert.equal(row.total, Number(expectedRow.total_certificado));
  }
});

for (const [label, doc, pages, firstTablePage] of variants) {
  test(label + ": extracción digital y origen de las tres filas", () => {
    assert.equal(doc.extraction.pages.length, pages);
    assert.equal(doc.extraction.needsOcr, false);
    assert.equal(doc.extraction.mode, "texto");
    assert.equal(doc.kind, "liquidacion");
    assert.equal(doc.profile, "capitalizacion_facturas");
    assert.equal(doc.rows.length, expected.facturas.length);
    for (const expectedRow of expected.facturas) {
      const row = invoiceOf(doc, expectedRow);
      assert.equal(row.sourcePage, firstTablePage);
      assert.equal(row.resarcitorio, Number(expectedRow.intereses_resarcitorios_liquidacion));
    }
    assert.equal(doc.metadata.suitStartDate, expected.liquidacion.fecha_demanda);
    assert.equal(doc.metadata.notificationDate, expected.liquidacion.fecha_notificacion_demanda);
    assert.equal(doc.metadata.liquidationDate, expected.liquidacion.fecha_corte);
  });
  test(label + ": cotejo nominal y reconstrucción hasta el total documentado", () => {
    const pair = pairDocuments(certificate, doc);
    assert.equal(pair.reliable, true);
    assert.ok(pair.rowMatches.length && pair.rowMatches.every(row => row.status === "ok"));
    const calc = recalculatePair(certificate, doc);
    assert.equal(calc.covered, true);
    assert.equal(calc.totalCapital, Number(expected.certificado.capital_original));
    assert.equal(calc.actualResarcitorio, Number(expected.liquidacion.intereses_resarcitorios_subtotal_publicado));
    assert.equal(calc.actualPunitorio, Number(expected.liquidacion.intereses_punitorios_pre_notificacion));
    assert.equal(roundMoney(calc.actualResarcitorio + calc.actualPunitorio), Number(expected.liquidacion.intereses_capitalizados));
    assert.equal(calc.actualCapitalized, Number(expected.liquidacion.capital_capitalizado));
    assert.equal(calc.actualPostCapitalizationPunitorio, Number(expected.liquidacion.intereses_punitorios_post));
    assert.equal(calc.actualTotal, Number(expected.liquidacion.total_liquidacion_presentada_y_aceptada));
  });
}

const { invoiceAudit } = await loadModule("lib/confronte/invoice-audit.ts");
test("El recálculo por período reproduce cada factura y tramo, incluso el subtotal sin redondeo por fila", () => {
  for (const [, sheet] of variants) {
    const audit = invoiceAudit(certificate, sheet, recalculatePair(certificate, sheet));
    assert.deepEqual(audit.missing, []);
    assert.deepEqual(audit.differences, []);
    assert.equal(audit.total, Number(expected.liquidacion.total_liquidacion_presentada_y_aceptada));
    const wrong = {...sheet, rows:sheet.rows.map((r,i)=>i ? r : {...r, resarcitorio:r.resarcitorio+1})};
    assert.equal(invoiceAudit(certificate, wrong, recalculatePair(certificate,wrong)).consistent,false);
  }
});
