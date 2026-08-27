import {
  addDays,
  canonicalDocumentId,
  clamp,
  normalizePosition,
  normalizeText,
  parseDate,
  parseMoney,
  stableId,
} from "../domain/normalize";
import type {
  AuditIssue,
  DebtRow,
  DocumentKind,
  DocumentMetadata,
  DocumentProfile,
  ExtractionResult,
  ParsedDocument,
  SpecialDocumentData,
} from "../domain/types";

interface ParseInput {
  fileName: string;
  fileSize: number;
  extraction: ExtractionResult;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim().replace(/\s+/g, " ");
  }
  return undefined;
}

function classify(text: string): { kind: DocumentKind; profile: DocumentProfile } {
  const normalized = normalizeText(text);
  const hasLiquidationTable =
    /DETALLE DE LIQUIDACION/.test(normalized) &&
    /IMP NOMINAL/.test(normalized) &&
    /INTERES RESA[A-Z]* INTERES PUNITORIOS?/.test(normalized);
  const isLiquidation =
    /LIQUIDACION MANDATARIO/.test(normalized) ||
    /LIQUIDACION MANDATARIOS/.test(normalized) ||
    /TIPO CALCULO RESARCITORIO/.test(normalized) ||
    hasLiquidationTable;
  const kind: DocumentKind = isLiquidation
    ? "liquidacion"
    : /CONSTANCIA DE DEUDA|CERTIFICADO DE DEUDA/.test(normalized)
      ? "constancia"
      : "desconocido";

  const hasCapitalization =
    /CAPITALIZACION(?:\s+DE)?\s+INTERESES/.test(normalized) ||
    /TOTAL CAPITALIZADO/.test(normalized) ||
    /PUNITORIOS? HASTA LA NOTIFICACION DE DEMANDA/.test(normalized) ||
    /PUNITORIO SOBRE INTERES CAPITALIZADO/.test(normalized);
  const hasInvoiceStructure = /FACTURA|COMPROBANTE|NOTA DE (?:DEBITO|CREDITO)/.test(normalized);
  const isSpecialInvoiceCertificate =
    kind === "constancia" &&
    /CERTIFICADO DE DEUDA/.test(normalized) &&
    hasInvoiceStructure;
  if ((hasCapitalization || isSpecialInvoiceCertificate) && hasInvoiceStructure) {
    return { kind, profile: "capitalizacion_facturas" };
  }
  if (hasCapitalization) {
    return { kind, profile: "capitalizacion_posiciones" };
  }
  if (/TASA DE ESTUDIO REVISION E INSPECCION|\bTERI\b|TIPO CALCULO RESARCITORIO/.test(normalized)) {
    return { kind, profile: "deuda_unica" };
  }
  if (/SALDO IMPAGO AL|DIRECCION GENERAL DE RENTAS/.test(normalized) && /DOMINIO/.test(normalized)) {
    return { kind, profile: "agip_historica" };
  }
  if (kind !== "desconocido") return { kind, profile: "estandar" };
  return { kind, profile: "desconocido" };
}

function parseMetadata(text: string, kind: DocumentKind, profile: DocumentProfile): DocumentMetadata {
  const adjudication = firstMatch(text, [
    /Adjudicaci[oó]n(?:\s+N[°º]|\s*N[º°]|)\s*:?\s*([\d-]+)/i,
  ])?.replace(/\D/g, "");
  const certificate = firstMatch(text, [
    /CERTIFICADO DE DEUDA\s*N[°º'’]?\s*([\d]+)/i,
    /Certificado\s+([\d]+)/i,
  ])?.replace(/\D/g, "");
  const caseNumber = firstMatch(text, [
    /EXPEDIENTE:\s*([^\n\r]+)/i,
    /expediente:\s*([^,\n\r]+)/i,
    /\b((?:EX|EE)-\d{4}-\d+(?:-\s*-)?GCABA-[A-Z0-9-]+)/i,
  ]);
  const taxOrConcept = firstMatch(text, [
    /Detalle de deuda:\s*([^\n\r]+)/i,
    /En concepto de:\s*([^\n\r]+)/i,
    /Concepto:\s*([^\n\r]+)/i,
  ]);
  const court = firstMatch(text, [/Juzgado\s*N[º°]:\s*([^\s\n]+)/i]);
  const clerkOffice = firstMatch(text, [/Secretar[ií]a:\s*([^\s\n]+)/i]);
  const suitStartDate = parseDate(firstMatch(text, [
    /FECHA DE INICIO DE JUICIO\s*:?\s*([\d/-]+)/i,
    /Fecha Inicio de Ju(?:i?c)io:\s*([\d/-]+)/i,
    /Fecha Desde:\s*([\d/-]+)/i,
  ]));
  const notificationDate = parseDate(firstMatch(text, [
    /FECHA DE NOTIFICACI[ÓO]N DE DEMANDA\s*:?\s*([\d/-]+)/i,
  ]));
  const liquidationDate = parseDate(firstMatch(text, [
    /FECHA DE LIQUIDACI[ÓO]N\s*:?\s*([\d/-]+)/i,
    /Fecha Liquidaci[oó]n:\s*([\d/-]+)/i,
    /Fecha Hasta:\s*([\d/-]+)/i,
    /Fecha de generaci[oó]n:\s*([\d/-]+)/i,
  ]));
  const documentDate = parseDate(firstMatch(text, [
    /Buenos Aires,\s*(?:\w+\s+)?(\d{1,2}\s+de\s+[A-Za-záéíóúñ]+\s+de\s+\d{4})/i,
    /se expide[^\n]{0,100}?(\d{1,2}\s+d[ií]as?\s+del?\s+mes\s+de\s+[A-Za-záéíóúñ]+\s+de\s+\d{4})/i,
  ]));
  const interestCutoffDate = parseDate(firstMatch(text, [
    /SALDO\s+IMPAGO\s+AL\s*[:=\-]?\s*((?:19|20)\d{2}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2})/i,
  ]));

  let declaredTotal: number | undefined;
  const totalPatterns = profile === "deuda_unica"
    ? [
        /Total de la deuda[^=]*=\s*\$?\s*([\d.,]+)/gi,
        /TOTAL\s*:?\s*\$?\s*([\d.,]+)/gi,
      ]
    : profile === "capitalizacion_facturas" || profile === "capitalizacion_posiciones"
      ? [/\bTOTAL\b\s*\$?\s*([\d.,]+)/gi, /TOTAL CAPITALIZADO\s*\$?\s*([\d.,]+)/gi]
      : [/\bTOTAL:\s*\$?\s*([\d.,]+)/gi, /Suma adeudada:\s*\$?\s*([\d.,]+)/gi];
  const totalCandidates: Array<{ index: number; value: number }> = [];
  for (const pattern of totalPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const parsed = parseMoney(match[1]);
      if (parsed !== undefined) totalCandidates.push({ index: match.index ?? 0, value: parsed });
    }
  }
  totalCandidates.sort((left, right) => left.index - right.index);
  declaredTotal = totalCandidates.at(-1)?.value;

  if (profile === "deuda_unica") {
    const debtTotalLine = text.match(/Total de la deuda[^\n\r]+/i)?.[0];
    const debtTotalValues = debtTotalLine ? moneyValues(debtTotalLine) : [];
    if (debtTotalValues.length) declaredTotal = debtTotalValues.at(-1);
  }

  if (profile === "agip_historica") {
    const balanceLine = text.match(/SALDO\s+IMPAGO\s+AL[^\n\r]+/i)?.[0];
    if (balanceLine) {
      const afterDate = balanceLine.replace(/^.*?(?:19|20)\d{2}-\d{1,2}-\d{1,2}/, "");
      const balanceValues = historicalMoneyValues(afterDate);
      if (balanceValues.length) declaredTotal = balanceValues.at(-1);
    }
  }

  if (kind === "constancia" && profile === "estandar" && declaredTotal === undefined) {
    declaredTotal = parseMoney(firstMatch(text, [/Suma adeudada:\s*([\d.,]+)/i]));
  }

  return {
    adjudication,
    certificate,
    caseNumber,
    taxOrConcept,
    court,
    clerkOffice,
    documentDate,
    suitStartDate,
    notificationDate,
    liquidationDate,
    interestCutoffDate,
    declaredTotal,
  };
}

function moneyValues(value: string): number[] {
  return [...value.matchAll(/(?:\$\s*)?([\d][\d.,]*)/g)]
    .map((match) => parseMoney(match[1]))
    .filter((item): item is number => item !== undefined);
}

function historicalMoneyValues(value: string): number[] {
  const compact = value
    .replace(/([.,])\s+(?=\d{2}(?:\D|$))/g, "$1")
    .replace(/(\d)\/(?=\d{2}(?:\D|$))/g, "$1,")
    .replace(/\b(\d{1,3})\.(\d{3})(\d{2})\b/g, "$1.$2,$3");
  return [...compact.matchAll(/(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2})(?!\d)/g)]
    .map((match) => parseMoney(match[1]))
    .filter((item): item is number => item !== undefined);
}

function calculationSection(text: string, kind: "Resarcitorio" | "Punitorio"): string {
  const start = new RegExp(`Tipo\\s+C[áa]lculo:\\s*${kind}`, "i").exec(text);
  if (!start || start.index === undefined) return "";
  const sectionStart = start.index + start[0].length;
  if (kind === "Resarcitorio") {
    const next = /Tipo\s+C[áa]lculo:\s*Punitorio/i.exec(text.slice(sectionStart));
    return text.slice(sectionStart, next?.index === undefined ? undefined : sectionStart + next.index);
  }
  return text.slice(sectionStart);
}

function parseSpecialData(
  text: string,
  kind: DocumentKind,
  profile: DocumentProfile,
  metadata: DocumentMetadata,
): SpecialDocumentData | undefined {
  if (kind !== "liquidacion") return undefined;

  if (profile === "deuda_unica") {
    const resSection = calculationSection(text, "Resarcitorio");
    const punSection = calculationSection(text, "Punitorio");
    const data: SpecialDocumentData = {
      resarcitorioFrom: parseDate(firstMatch(resSection, [/Fecha Desde:\s*([\d/-]+)/i])),
      resarcitorioTo: parseDate(firstMatch(resSection, [/Fecha Hasta:\s*([\d/-]+)/i])),
      punitorioFrom: parseDate(firstMatch(punSection, [/Fecha Desde:\s*([\d/-]+)/i])),
      punitorioTo: parseDate(firstMatch(punSection, [/Fecha Hasta:\s*([\d/-]+)/i])),
      finalTotalDeclared: metadata.declaredTotal,
    };
    return Object.values(data).some(Boolean) ? data : undefined;
  }

  if (profile !== "capitalizacion_facturas" && profile !== "capitalizacion_posiciones") return undefined;

  const punitorioTotals = [...text.matchAll(/TOTAL\s+INTERESES\s+PUNITORIOS\s*\$?\s*([\d.,]+)/gi)]
    .map((match) => parseMoney(match[1]))
    .filter((value): value is number => value !== undefined);
  const capitalizedDeclared = parseMoney(firstMatch(text, [
    /TOTAL\s+CAPITALIZADO\s*\$?\s*([\d.,]+)/i,
  ]));
  const postStart = text.search(/D[ÍI]AS\s+DE\s+MORA\s+JUDICIAL\s+HASTA\s+LA\s+LIQUIDACI[ÓO]N/i);
  const postSection = postStart >= 0 ? text.slice(postStart) : "";
  const postValues = [...postSection.matchAll(/(?:TOTAL\s+)?INTERESES\s+PUNITORIOS(?:\s+HASTA\s+LA\s+LIQUIDACI[ÓO]N)?(?:\.?\s*TASA\s*\d+)?\s*\$?\s*([\d.,]+)/gi)]
    .map((match) => parseMoney(match[1]))
    .filter((value): value is number => value !== undefined);

  return {
    priorPunitorioDeclared: punitorioTotals[0],
    capitalizedDeclared,
    postCapitalizationPunitorioDeclared: punitorioTotals.length > 1
      ? punitorioTotals.at(-1)
      : postValues.at(-1),
    finalTotalDeclared: metadata.declaredTotal,
  };
}

function parseStandardRows(extraction: ExtractionResult, kind: DocumentKind): DebtRow[] {
  const rows: DebtRow[] = [];
  for (const page of extraction.pages) {
    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      const match = line.match(
        /^((?:19|20)\d{2}\s*[-\/]\s*\d{1,3})\s+(.+?)\s+((?:19|20)\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+)$/,
      );
      if (!match) continue;
      const position = normalizePosition(match[1]);
      const dueDate = parseDate(match[3]);
      const values = moneyValues(match[4]);
      if (!position || !dueDate || !values.length) continue;
      const capital = values[0];
      const key = position;
      const isLiquidationRow = kind === "liquidacion" && values.length >= 4;
      const resarcitorio = isLiquidationRow ? values[1] : undefined;
      const punitorio = isLiquidationRow ? values[2] : undefined;
      let total = isLiquidationRow ? values[3] : values.length >= 3 ? values[2] : undefined;
      const inferredFields: string[] = [];
      const notes: string[] = [];
      if (
        extraction.mode !== "texto" &&
        isLiquidationRow &&
        resarcitorio !== undefined &&
        punitorio !== undefined &&
        total !== undefined
      ) {
        const componentTotal = Math.round((capital + resarcitorio + punitorio + Number.EPSILON) * 100) / 100;
        if (Math.abs(componentTotal - total) >= 0.01) {
          notes.push(`Total OCR '${total}' reconstruido por la identidad capital + resarcitorio + punitorio.`);
          inferredFields.push("total");
          total = componentTotal;
        }
      }
      rows.push({
        id: stableId(page.pageNumber, key, capital, rows.length),
        key,
        position,
        concept: match[2].trim(),
        dueDate,
        capital,
        resarcitorio,
        punitorio,
        total,
        sourcePage: page.pageNumber,
        confidence: inferredFields.length ? 0.78 : isLiquidationRow || values.length <= 3 ? 0.97 : 0.82,
        inferredFields,
        notes,
      });
    }
  }
  return deduplicateRows(rows);
}

function parseHistoricalRows(extraction: ExtractionResult, declaredTotal?: number): DebtRow[] {
  const rows: DebtRow[] = [];
  for (const page of extraction.pages) {
    const blocks: string[] = [];
    let current = "";
    for (const rawLine of page.text.split(/\r?\n/)) {
      let line = rawLine.replace(/\s+/g, " ").trim();
      const yearOffset = line.search(/(?:19|20)\d{2}/);
      if (yearOffset > 0 && yearOffset <= 12) line = line.slice(yearOffset);
      if (!line || /^(?:19|20)\d{2}$/.test(line)) continue;
      const beginsRow = /^(?:19|20)\d{2}\s+(?:(?:19|20)\d{2}\s+)?(?:[A-Za-z\[\]Il|]*\d{1,3}[A-Za-z\[\]Il|]*(?:\s|$)|[A-Za-z\[\]Il|]{1,4}\s+(?=\d{1,2}\/)|\d{1,2}\/\d{1,2}\/)/.test(line);
      if (beginsRow) {
        if (current) blocks.push(current);
        current = line;
      } else if (current && !/^(?:SALDO IMPAGO|El importe|Consideraciones|GOBIERNO)/i.test(line)) {
        current += ` ${line}`;
      } else if (/^(?:SALDO IMPAGO|El importe|Consideraciones|GOBIERNO)/i.test(line)) {
        if (current) blocks.push(current);
        current = "";
      }
    }
    if (current) blocks.push(current);

    for (const block of blocks) {
      const yearMatch = block.match(/^((?:19|20)\d{2})\s+/);
      const dateMatch = block.match(/\b\d{1,2}\/\d{1,2}\/(?:19|20)\d{2}\b/);
      if (!yearMatch || !dateMatch || dateMatch.index === undefined) continue;
      const prefix = block.slice(yearMatch[0].length, dateMatch.index).replace(new RegExp(`^${yearMatch[1]}\\s+`), "");
      const installmentMatch = prefix.match(/(\d{1,3})/);
      let dueDate = parseDate(dateMatch[0]);
      const values = historicalMoneyValues(block.slice(dateMatch.index + dateMatch[0].length));
      if (!dueDate || !values.length) continue;
      let installment = installmentMatch ? Number(installmentMatch[1]) : 0;
      const inferredFields: string[] = [];
      const notes: string[] = [];
      if (extraction.mode !== "texto" && !dueDate.startsWith(yearMatch[1])) {
        dueDate = `${yearMatch[1]}${dueDate.slice(4)}`;
        inferredFields.push("dueDate");
        notes.push(`Año de vencimiento reparado desde '${dateMatch[0]}' por coincidencia con la posición.`);
      }
      if (!installment || installment > 12) {
        const previous = rows.at(-1);
        const previousInstallment = previous?.position ? Number(previous.position.split("-")[1]) : 0;
        installment = previous?.position?.startsWith(`${yearMatch[1]}-`) && previousInstallment < 12
          ? previousInstallment + 1
          : Math.min(12, Number(String(installment).at(-1)) || 1);
        inferredFields.push("position");
        notes.push(`Cuota original '${installmentMatch?.[1] ?? "ausente"}' reparada por continuidad cronológica.`);
      }
      const total = values.at(-1);
      let capital = values[0];
      if (total !== undefined && capital > total) {
        capital = values.find((value, index) => index < values.length - 1 && value <= total) ?? capital;
      }
      const previousCapital = rows.at(-1)?.capital;
      if (values.length >= 4 && previousCapital !== undefined && Math.abs(capital - previousCapital) / Math.max(1, previousCapital) > 0.1) {
        const repeated = values.slice(1, -1).find((value) => Math.abs(value - previousCapital) / Math.max(1, previousCapital) < 0.01);
        if (repeated !== undefined) capital = repeated;
      }
      const position = normalizePosition(`${yearMatch[1]}-${installment}`)!;
      rows.push({
        id: stableId(page.pageNumber, position, capital, rows.length),
        key: position,
        position,
        dueDate,
        capital,
        total: values.length >= 2 ? total : undefined,
        sourcePage: page.pageNumber,
        confidence: inferredFields.length ? 0.68 : 0.86,
        inferredFields,
        notes,
      });
    }
  }
  const uniqueRows = deduplicateRows(rows);
  if (extraction.mode === "texto") return uniqueRows;

  const modalCapitalByYear = new Map<string, number>();
  const years = uniqueRows
    .map((row) => row.position?.slice(0, 4))
    .filter((year): year is string => Boolean(year));
  for (const year of new Set(years)) {
    const yearRows = uniqueRows.filter((row) => row.position?.startsWith(`${year}-`));
    const counts = new Map<string, number>();
    for (const row of yearRows) {
      const key = row.capital.toFixed(2);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const mode = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
    if (mode && mode[1] >= 2 && mode[1] >= Math.ceil(yearRows.length / 2)) {
      modalCapitalByYear.set(year, Number(mode[0]));
    }
  }

  let repairedRows = uniqueRows.map((row) => {
    const year = row.position?.slice(0, 4);
    const modal = year ? modalCapitalByYear.get(year) : undefined;
    if (modal === undefined || modal === row.capital) return row;
    if (row.total === undefined && row.capital > modal && row.capital < modal * 3) {
      return {
        ...row,
        capital: modal,
        total: row.capital,
        confidence: Math.min(row.confidence, 0.62),
        inferredFields: [...new Set([...(row.inferredFields ?? []), "capital", "total"])],
        notes: [...(row.notes ?? []), `Separadores OCR ausentes: se recuperó el capital repetido de ${year} y se conservó '${row.capital.toFixed(2)}' como total certificado.`],
      };
    }
    const original = row.capital.toFixed(2);
    const expected = modal.toFixed(2);
    const differentDigits = [...original].filter((character, index) => character !== expected[index]).length;
    if (original.length !== expected.length || differentDigits !== 1) return row;
    return {
      ...row,
      capital: modal,
      confidence: Math.min(row.confidence, 0.68),
      inferredFields: [...new Set([...(row.inferredFields ?? []), "capital"])],
      notes: [...(row.notes ?? []), `Capital OCR '${original}' reparado por repetición consistente dentro de ${year}.`],
    };
  });

  if (declaredTotal !== undefined && repairedRows.every((row) => row.total !== undefined)) {
    const rowsTotal = Math.round((repairedRows.reduce((sum, row) => sum + (row.total ?? 0), 0) + Number.EPSILON) * 100) / 100;
    const discrepancy = Math.round((declaredTotal - rowsTotal + Number.EPSILON) * 100) / 100;
    const candidates = repairedRows.filter((row) => row.inferredFields?.includes("total"));
    if (Math.abs(discrepancy) >= 0.01 && Math.abs(discrepancy) <= 100 && candidates.length === 1) {
      const candidateId = candidates[0].id;
      repairedRows = repairedRows.map((row) => row.id !== candidateId ? row : ({
        ...row,
        total: Math.round(((row.total ?? 0) + discrepancy + Number.EPSILON) * 100) / 100,
        confidence: Math.min(row.confidence, 0.58),
        inferredFields: [...new Set([...(row.inferredFields ?? []), "total"])],
        notes: [...(row.notes ?? []), `Total OCR conciliado con el saldo certificado global ${declaredTotal.toFixed(2)}.`],
      }));
    }
  }
  return repairedRows;
}

function parseInvoiceRows(extraction: ExtractionResult, kind: DocumentKind): DebtRow[] {
  const rows: DebtRow[] = [];
  for (const page of extraction.pages) {
    for (const rawLine of page.text.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+/g, " ").trim();
      const match = line.match(
        /^((?:FAC|FAE|NDB)[A-Z0-9\s-]*?\d{2,})\s+(\d{1,2}\/\d{1,2}\/\d{2,4})(?:\s+(\d{1,2}\/\d{1,2}\/\d{2,4}))?\s+(.+)$/i,
      );
      if (!match) continue;
      const originalDocumentId = match[1].trim();
      const documentId = canonicalDocumentId(originalDocumentId);
      if (!documentId) continue;
      const presentationDate = parseDate(match[2]);
      let dueDate = parseDate(match[3]);
      const dollarValues = [...match[4].matchAll(/\$\s*([\d.,]+)/g)]
        .map((item) => parseMoney(item[1]))
        .filter((item): item is number => item !== undefined);
      const values = dollarValues.length ? dollarValues : moneyValues(match[4]);
      if (!values.length) continue;
      const inferredFields: string[] = [];
      const notes: string[] = [];
      if (!dueDate && presentationDate) {
        dueDate = addDays(presentationDate, 30);
        inferredFields.push("dueDate");
        notes.push("Fecha de mora inferida como presentación + 30 días; requiere revisión.");
      }
      const capital = values[0];
      const hasRate = /%/.test(match[4]);
      const resarcitorio = kind === "liquidacion" && hasRate ? values.at(-1) : kind === "constancia" && values.length >= 2 ? values[1] : undefined;
      const total = kind === "constancia" && values.length >= 3 ? values.at(-1) : undefined;
      rows.push({
        id: stableId(page.pageNumber, documentId, capital, rows.length),
        key: documentId,
        documentId,
        originalDocumentId,
        presentationDate,
        dueDate,
        capital,
        resarcitorio,
        total,
        sourcePage: page.pageNumber,
        confidence: inferredFields.length ? 0.66 : 0.9,
        inferredFields,
        notes,
      });
    }
  }
  return deduplicateRows(rows);
}

function parseUniqueDebtRows(extraction: ExtractionResult, kind: DocumentKind): DebtRow[] {
  const text = extraction.text;
  const capital = parseMoney(firstMatch(text, [
    /Importe:\s*\$?\s*([\d.,]+)/i,
    /VENCIMIENTO\s+IMPORTE NOMINAL[\s\S]{0,180}?\$\s*([\d.,]+)/i,
  ]));
  const dueDate = parseDate(firstMatch(text, [
    /AÑO\s+MES\s+VENCIMIENTO[\s\S]{0,150}?((?:\d{1,2}\/){2}\d{2,4})/i,
    /Fecha Desde:\s*([\d/-]+)/i,
  ]));
  if (capital === undefined) return [];
  const resarcitorio = kind === "liquidacion"
    ? parseMoney(firstMatch(text, [/Total Intereses Resarcitorio\s*\$?\s*([\d.,]+)/i]))
    : undefined;
  const punitorio = kind === "liquidacion"
    ? parseMoney(firstMatch(text, [/Total Intereses Punitorio\s*\$?\s*([\d.,]+)/i]))
    : undefined;
  const total = kind === "liquidacion"
    ? parseMoney(firstMatch(text, [/Total de la deuda[^=]*=\s*\$?\s*([\d.,]+)/i]))
    : undefined;
  return [{
    id: stableId("deuda-unica", capital, dueDate),
    key: "DEUDA-UNICA",
    position: "Deuda única",
    dueDate,
    capital,
    resarcitorio,
    punitorio,
    total,
    sourcePage: 1,
    confidence: dueDate ? 0.95 : 0.75,
  }];
}

function deduplicateRows(rows: DebtRow[]): DebtRow[] {
  const unique = new Map<string, DebtRow>();
  for (const row of rows) {
    const existing = unique.get(row.key);
    if (!existing || row.confidence > existing.confidence) unique.set(row.key, row);
  }
  return [...unique.values()];
}

function buildIssues(
  extraction: ExtractionResult,
  kind: DocumentKind,
  profile: DocumentProfile,
  metadata: DocumentMetadata,
  rows: DebtRow[],
  special?: SpecialDocumentData,
): AuditIssue[] {
  const issues: AuditIssue[] = [];
  if (kind === "desconocido") {
    issues.push({ id: "kind", severity: "critical", title: "Documento no reconocido", detail: "No se identificó una constancia ni una liquidación compatible." });
  }
  if (!rows.length) {
    issues.push({ id: "rows", severity: "critical", title: "Sin renglones confiables", detail: "La tabla no pudo reconstruirse. Revise el texto extraído o active OCR." });
  }
  if (extraction.mode !== "texto") {
    issues.push({ id: "ocr", severity: "warning", title: "Lectura asistida por OCR", detail: "Los valores provienen total o parcialmente de reconocimiento óptico y deben revisarse." });
  }
  if (extraction.needsOcr) {
    issues.push({ id: "ocr-pending", severity: "critical", title: "PDF sin capa de texto útil", detail: "Es necesario ejecutar el OCR local antes de confrontar." });
  }
  if (kind === "liquidacion" && profile === "estandar" && (!metadata.suitStartDate || !metadata.liquidationDate)) {
    issues.push({ id: "dates", severity: "critical", title: "Fechas judiciales incompletas", detail: "La fecha de inicio o de liquidación falta y el recálculo no puede cerrarse." });
  }
  if (kind === "constancia" && profile === "agip_historica" && !metadata.interestCutoffDate) {
    issues.push({
      id: "historical-cutoff",
      severity: "warning",
      title: "Fecha de corte histórica no leída",
      detail: "Revise el campo 'Intereses certificados al'. Sin esa fecha, la aplicación no puede separar el interés certificado de su continuación.",
      field: "interestCutoffDate",
    });
  }
  if (kind === "constancia" && profile === "agip_historica" && rows.some((row) => row.total === undefined)) {
    issues.push({
      id: "historical-row-totals",
      severity: "warning",
      title: "Intereses certificados incompletos",
      detail: "Uno o más renglones no conservan la columna 'deuda más intereses'; revise la grilla antes de aceptar el confronte.",
    });
  }
  if (
    kind === "liquidacion" &&
    (profile === "capitalizacion_facturas" || profile === "capitalizacion_posiciones") &&
    (!metadata.suitStartDate || !metadata.notificationDate || !metadata.liquidationDate)
  ) {
    issues.push({
      id: "special-dates",
      severity: "critical",
      title: "Fechas de capitalización incompletas",
      detail: "La ejecución especial requiere inicio de juicio, notificación de demanda y fecha de liquidación.",
    });
  }
  if (
    kind === "liquidacion" &&
    profile === "deuda_unica" &&
    (!special?.resarcitorioFrom || !special.resarcitorioTo || !special.punitorioFrom || !special.punitorioTo)
  ) {
    issues.push({
      id: "combined-dates",
      severity: "critical",
      title: "Tramos combinados incompletos",
      detail: "No pudieron identificarse íntegramente los períodos resarcitorio y punitorio.",
    });
  }
  const inferredRows = rows.filter((row) => row.inferredFields?.length);
  if (inferredRows.length) {
    issues.push({
      id: "inferences",
      severity: "warning",
      title: `${inferredRows.length} renglón${inferredRows.length === 1 ? "" : "es"} con inferencias`,
      detail: "Las inferencias están marcadas en la grilla y nunca se consideran confirmadas automáticamente.",
    });
  }
  return issues;
}

export function parseDocument(input: ParseInput): ParsedDocument {
  const { kind, profile } = classify(input.extraction.text);
  const metadata = parseMetadata(input.extraction.text, kind, profile);
  const special = parseSpecialData(input.extraction.text, kind, profile, metadata);
  let rows: DebtRow[];
  if (profile === "capitalizacion_facturas") {
    rows = parseInvoiceRows(input.extraction, kind);
  } else if (profile === "deuda_unica") {
    rows = parseUniqueDebtRows(input.extraction, kind);
  } else if (profile === "agip_historica" && kind === "constancia") {
    rows = parseHistoricalRows(input.extraction, metadata.declaredTotal);
  } else {
    rows = parseStandardRows(input.extraction, kind);
  }

  const issues = buildIssues(input.extraction, kind, profile, metadata, rows, special);
  const metadataScore = [
    metadata.adjudication ?? metadata.certificate,
    metadata.caseNumber ?? metadata.taxOrConcept,
    metadata.liquidationDate ?? metadata.documentDate ?? special?.punitorioTo,
  ].filter(Boolean).length / 3;
  const rowScore = rows.length ? rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length : 0;
  const confidence = clamp(input.extraction.quality * 0.25 + metadataScore * 0.25 + rowScore * 0.5);
  return {
    id: stableId(input.fileName, input.fileSize, input.extraction.fingerprint),
    fileName: input.fileName,
    fileSize: input.fileSize,
    kind,
    profile,
    metadata,
    special,
    rows,
    extraction: input.extraction,
    confidence,
    issues,
    reviewed: false,
  };
}
