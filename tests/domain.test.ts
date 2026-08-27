import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateInterest,
  recalculatePair,
  resolveConfronteScenario,
} from "../lib/confronte/calculate";
import { pairDocuments } from "../lib/confronte/pairing";
import {
  canonicalDocumentId,
  formatMoney,
  formatMoneyPlain,
  parseMoney,
} from "../lib/domain/normalize";
import type { ExtractionResult } from "../lib/domain/types";
import { parseDocument } from "../lib/parsers/parse-document";

function extraction(text: string, mode: "texto" | "ocr" = "texto"): ExtractionResult {
  return {
    pages: [{ pageNumber: 1, text, characterCount: text.replace(/\s/g, "").length, source: mode }],
    text,
    mode,
    needsOcr: false,
    quality: 0.98,
    fingerprint: "synthetic-fixture",
  };
}

const standardConstancia = `
Constancia de Deuda
Consta en los registros de esta Dirección General que: EJEMPLO DEL SUR SA Contribuyente del Impuesto sobre los Ingresos Brutos CUIT N° 30123456789, expediente: EX-2025-100-GCABA-DGR, adjudicación N°: 250000001.
Detalle de Deuda
Posición Concepto Vencimiento Imp. Nominal
2024-01 5218 - FP-ATRA 2024-02-15 1000.00
2024-02 5218 - FP-ATRA 2024-03-15 1250.50
TOTAL: 2250.50
`;

const standardLiquidacion = `
Liquidación Mandatario
EXPEDIENTE: 100-2025
Razón Social: EJEMPLO DEL SUR S.A.
ISIB-RG: CUIT 30123456789
Juzgado Nº: 15 Secretaría: 29 Adjudicación: 250000001
Fecha Liquidación: 14/12/2025 Fecha Inicio de Jucio: 04/09/2025
Posición Concepto Vencimiento Imp. Nominal Interes Resacitorios Interes Punitorios Total
2024/1 5229-DAGJ 15/02/2024 1.000,00 900,00 100,00 2.000,00
2024/2 5229-DAGJ 15/03/2024 1.250,50 1.000,00 125,00 2.375,50
Subtotal 2.250,50 1.900,00 225,00 4.375,50
TOTAL: 4.375,50
`;

test("normaliza importes argentinos e identificadores de comprobantes", () => {
  assert.equal(parseMoney("$ 1.234.567,89"), 1_234_567.89);
  assert.equal(parseMoney("40,083,419.21"), 40_083_419.21);
  assert.equal(formatMoney(153_000.22), "$153.000,22");
  assert.equal(formatMoneyPlain(153_000.2), "153.000,20");
  assert.equal(canonicalDocumentId("FACB2 0002 - 00000424"), "FAC-424");
  assert.equal(canonicalDocumentId("FACASIB-424"), "FAC-424");
  assert.equal(canonicalDocumentId("NDBASI-00053"), "NDB-53");
});

test("reconstruye y confronta una pareja estándar", () => {
  const constancia = parseDocument({ fileName: "constancia.pdf", fileSize: 100, extraction: extraction(standardConstancia) });
  const liquidacion = parseDocument({ fileName: "liquidacion.pdf", fileSize: 100, extraction: extraction(standardLiquidacion) });
  assert.equal(constancia.kind, "constancia");
  assert.equal(liquidacion.kind, "liquidacion");
  assert.equal(constancia.rows.length, 2);
  assert.equal(liquidacion.rows.length, 2);
  assert.equal(constancia.rows[1].capital, 1250.5);
  assert.equal(liquidacion.metadata.liquidationDate, "2025-12-14");
  const result = pairDocuments(constancia, liquidacion);
  assert.equal(result.rowMatches.length, 2);
  assert.equal(result.rowMatches.every((row) => row.status === "ok"), true);
  assert.equal(result.checks.some((check) => check.status === "critical"), false);
});

test("reconoce una liquidación aunque el OCR omita el título y conserva sus cuatro columnas", () => {
  const parsed = parseDocument({
    fileName: "liquidacion-ocr.pdf",
    fileSize: 100,
    extraction: extraction(`
Detalle de Liquidación
Posición Concepto Vencimiento Imp. Nominal Interes Resacitorios Interes Punitorios Total
2016/6 5229-DAGJ 20/12/2016 635,36 473,34 3.191,20 4.209,90
2017/5 5229-DAGJ 20/10/2017 819,28 364,58 4.114,96 5.298,82
Subtotal 1.454,64 837,92 7.306,16 9.598,72
TOTAL: 9.598,72
`, "ocr"),
  });

  assert.equal(parsed.kind, "liquidacion");
  assert.equal(parsed.profile, "estandar");
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].resarcitorio, 473.34);
  assert.equal(parsed.rows[0].punitorio, 3_191.2);
  assert.equal(parsed.rows[0].total, 4_299.9);
  assert.deepEqual(parsed.rows[0].inferredFields, ["total"]);
  assert.equal(parsed.rows[1].total, 5_298.82);
});

test("ignora CUIT y razón social y confronta por certificado y deuda", () => {
  const certificate = parseDocument({
    fileName: "certificado.pdf",
    fileSize: 100,
    extraction: extraction(`CERTIFICADO DE DEUDA N° 959\nque la entidad PARTE ALFA S.A., C.U.I.T: 30-11111111-1\nFACTURA N° FECHA CAPITAL\nFACB2 0002 - 00000424 10/06/2010 $ 40,00 $ 20,00 $ 60,00`),
  });
  const liquidation = parseDocument({
    fileName: "especial.pdf",
    fileSize: 100,
    extraction: extraction(`LIQUIDACIÓN MANDATARIOS CAPITALIZACIÓN DE INTERESES\nPARTE BETA S.A.\nCERTIFICADO DE DEUDA N° 959\nFECHA DE INICIO DE JUICIO 17/11/17\nFECHA DE LIQUIDACION 31/10/25\nCOMPROBANTE FECHA FECHA CAPITAL DIAS MORA TASA ACUMULADA INTERESES\nFACASIB-424 10/06/10 10/07/10 $ 40,00 2687 222,36% $ 88,95`),
  });
  const result = pairDocuments(certificate, liquidation);
  assert.equal(result.checks.find((check) => check.id === "certificado")?.status, "ok");
  assert.equal(result.checks.some((check) => check.id === "parte" || check.id === "cuit"), false);
  assert.equal(result.reliable, true);
});

test("recalcula una deuda única por sus períodos resarcitorio y punitorio", () => {
  const left = parseDocument({ fileName: "constancia.pdf", fileSize: 10, extraction: extraction("CONSTANCIA DE DEUDA TERI\nAÑO MES VENCIMIENTO IMPORTE NOMINAL\n2021 MAYO 20/07/2021 $ 40.000,00") });
  const right = parseDocument({ fileName: "liquidacion.pdf", fileSize: 10, extraction: extraction("Tipo Cálculo: Resarcitorio\nImporte: $ 40.000,00\nFecha Desde: 20/07/2021\nFecha Hasta: 28/11/2023\nTotal Intereses Resarcitorio $ 10.000,00\nTipo Cálculo: Punitorio\nImporte: $ 40.000,00\nFecha Desde: 28/11/2023\nFecha Hasta: 14/12/2025\nTotal Intereses Punitorio $ 20.000,00\nTotal de la deuda (Capital + Intereses) = $ 40.000,00 + $ 30.000,00 = $ 70.000,00") });
  assert.equal(pairDocuments(left, right).reliable, true);
  assert.equal(right.metadata.declaredTotal, 70_000);
  const calculation = recalculatePair(left, right);
  assert.equal(calculation.scenario, "deuda_unica");
  assert.equal(calculation.rows.length, 1);
  assert.equal(calculation.covered, true);
  assert.ok(calculation.rows[0].resarcitorioTranches.length > 0);
  assert.ok(calculation.rows[0].punitorioTranches.length > 0);
});

test("la liquidación especial gobierna el escenario y conserva sus dos capitalizaciones", () => {
  const certificate = parseDocument({
    fileName: "certificado-especial.pdf",
    fileSize: 100,
    extraction: extraction(`CERTIFICADO DE DEUDA N° 959
FACTURA N° FECHA CAPITAL
FACB2 0002 - 00000424 10/06/2010 $ 40,00 $ 20,00 $ 60,00`),
  });
  const liquidation = parseDocument({
    fileName: "liquidacion-especial.pdf",
    fileSize: 100,
    extraction: extraction(`LIQUIDACIÓN MANDATARIOS CAPITALIZACIÓN DE INTERESES
CERTIFICADO DE DEUDA N° 959
FECHA DE INICIO DE JUICIO 17/11/17
FECHA DE NOTIFICACIÓN DE DEMANDA 23/08/24
FECHA DE LIQUIDACIÓN 31/10/25
COMPROBANTE FECHA FECHA CAPITAL DIAS MORA TASA ACUMULADA INTERESES
FACASIB-424 10/06/10 10/07/10 $ 40,00 2687 222,36% $ 88,95
TOTAL INTERESES PUNITORIOS $ 25,00
TOTAL CAPITALIZADO $ 153,95
DÍAS DE MORA JUDICIAL HASTA LA LIQUIDACIÓN
TOTAL INTERESES PUNITORIOS $ 30,00
TOTAL $ 183,95`),
  });

  assert.equal(certificate.profile, "capitalizacion_facturas");
  assert.equal(liquidation.profile, "capitalizacion_facturas");
  assert.equal(resolveConfronteScenario({ ...certificate, profile: "estandar" }, liquidation), "capitalizacion_facturas");
  assert.deepEqual(liquidation.special, {
    priorPunitorioDeclared: 25,
    capitalizedDeclared: 153.95,
    postCapitalizationPunitorioDeclared: 30,
    finalTotalDeclared: 183.95,
  });

  const calculation = recalculatePair(certificate, liquidation);
  assert.equal(calculation.scenario, "capitalizacion_facturas");
  assert.equal(calculation.rows.length, 1);
  assert.equal(calculation.actualPunitorio, 25);
  assert.equal(calculation.actualCapitalized, 153.95);
  assert.equal(calculation.actualPostCapitalizationPunitorio, 30);
  assert.equal(calculation.actualTotal, 183.95);
  assert.equal(
    calculation.expectedCapitalized,
    Number((calculation.totalCapital + calculation.expectedResarcitorio + calculation.expectedPunitorio).toFixed(2)),
  );
  assert.ok(calculation.postCapitalizationTranches.length > 0);
  assert.equal(calculation.covered, true);

  const damagedCertificate = {
    ...certificate,
    rows: certificate.rows.map((row) => ({ ...row, capital: 999_999.99, dueDate: "2009-01-01" })),
  };
  const calculationWithDamagedCertificate = recalculatePair(damagedCertificate, liquidation);
  assert.equal(calculationWithDamagedCertificate.totalCapital, 40);
  assert.equal(calculationWithDamagedCertificate.covered, true);
});

test("repara una cuota histórica imposible y deja rastro de inferencia", () => {
  const parsed = parseDocument({
    fileName: "historica.pdf",
    fileSize: 100,
    extraction: extraction(`CONSTANCIA DE DEUDA\nDIRECCION GENERAL DE RENTAS\nContribuyente: PERSONA DEMO\nDOMINIO ABC123\nSALDO IMPAGO AL\n2007 05 5/10/2007 48,10 2,1399 102,93\n2007 90 7/12/2007 48,10 2,1000 101,01\n2008 2008 01 7/02/2008 103,11 2,0600 212,41`),
  });
  assert.equal(parsed.profile, "agip_historica");
  assert.equal(parsed.rows[1].position, "2007-06");
  assert.deepEqual(parsed.rows[1].inferredFields, ["position"]);
  assert.equal(parsed.rows[2].position, "2008-01");
});

test("reconstruye el corte de una constancia histórica y continúa el resarcitorio sin recalcular lo certificado", () => {
  const historical = parseDocument({
    fileName: "constancia-historica-ocr.pdf",
    fileSize: 100,
    extraction: extraction(`CONSTANCIA DE DEUDA
DIRECCION GENERAL DE RENTAS
DOMINIO DEMO123
2013 06 9/12/2013 $ 255,64 2,7500 703,01
2016 03 21/06/2016 $ 635,36 1,8999 1.207,18
2016 04 19/08/2016 $ 635,36 1/8399 1.169, 06
2016 05 20/10/2016 $ 635,36 1,7799 1.130,94
2016 06 20/12/2016 $ 835,36 1,7200 1.092,82
2017 [1] 21/02/2011 $ 819,28 1,6599 1.360,00
2017 a2 21/04/2017 $ 819,28 1/6000 1.310/85
2017 03 21/06/2017 $ 819,28 1/5399 1.26169
e 2017 04 22/08/2017 $ 819,28 1,4799 1.212,53
a 2017 05 20/10/2017 $ 818,28 1/4200 1.163/38
2017 06 21/12/2017 $ 819128 1/3599 1.144,22
SALDO IMPAGO AL 2018-11-30 $ 12.725,68`, "ocr"),
  });

  assert.equal(historical.profile, "agip_historica");
  assert.equal(historical.metadata.interestCutoffDate, "2018-11-30");
  assert.equal(historical.rows.length, 11);
  assert.equal(historical.rows.find((row) => row.key === "2016-06")?.capital, 635.36);
  assert.equal(historical.rows.find((row) => row.key === "2017-01")?.dueDate, "2017-02-21");
  assert.equal(historical.rows.find((row) => row.key === "2017-05")?.capital, 819.28);
  assert.equal(historical.rows.find((row) => row.key === "2017-06")?.total, 1_114.22);

  const singleHistorical = { ...historical, rows: [historical.rows.find((row) => row.key === "2016-03")!] };
  const liquidation = parseDocument({
    fileName: "liquidacion.pdf",
    fileSize: 100,
    extraction: extraction(`Liquidación Mandatario
Adjudicación: 999
Fecha Liquidación: 17/03/2026 Fecha Inicio de Jucio: 26/12/2018
Detalle de Liquidación
Posición Concepto Vencimiento Imp. Nominal Interes Resacitorios Interes Punitorios Total
2016/3 5229-DAGJ 21/06/2016 635,36 587,70 3.191,20 4.414,26
TOTAL: 4.414,26`),
  });
  const calculation = recalculatePair(singleHistorical, liquidation);
  assert.equal(calculation.rows[0].certifiedResarcitorio, 571.82);
  assert.equal(calculation.rows[0].expectedResarcitorio, 587.7);
  assert.equal(calculation.rows[0].actualResarcitorio, 587.7);
});

test("usa las tasas 2026 corregidas y no extrapola a 2027", () => {
  const h2 = calculateInterest(100_000, "2026-07-01", "2026-07-30", "punitorio");
  assert.equal(h2.covered, true);
  assert.equal(h2.tranches.length, 1);
  assert.ok(Math.abs(h2.interest - 3_866) < 0.001);
  const officialMonthPunitorio = calculateInterest(100_000, "2026-07-01", "2026-07-31", "punitorio");
  const officialMonthResarcitorio = calculateInterest(100_000, "2026-07-01", "2026-07-31", "resarcitorio");
  assert.equal(officialMonthPunitorio.interest, 3_994.87);
  assert.equal(officialMonthResarcitorio.interest, 2_663.24);
  const uncovered = calculateInterest(100_000, "2026-12-20", "2027-01-10", "resarcitorio");
  assert.equal(uncovered.covered, false);
});
