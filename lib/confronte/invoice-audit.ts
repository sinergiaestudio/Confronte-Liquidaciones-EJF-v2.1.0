import { addDays, daysInclusive, roundMoney } from "../domain/normalize";
import type { ConfronteCalculation, ParsedDocument } from "../domain/types";
import { calculateInterest } from "./calculate";
import { pairDocuments } from "./pairing";

type Comparison = { label: string; expected?: number; presented?: number; difference?: number };
const three = (value: number) => Math.round(value * 1000) / 1000;

export function invoiceAudit(cert: ParsedDocument, sheet: ParsedDocument, calc: ConfronteCalculation) {
  const missing: string[] = [];
  const differences: string[] = [];
  const checks: Comparison[] = [];
  const check = (label: string, expected?: number, presented?: number, precision = 2) => {
    const delta = expected === undefined || presented === undefined ? undefined :
      Number((presented - expected).toFixed(precision));
    checks.push({ label, expected, presented, difference: delta });
    if (delta === undefined) missing.push(label);
    else if (delta !== 0) differences.push(label);
  };
  const data = sheet.special;
  const { suitStartDate: start, notificationDate: notice, liquidationDate: cut } = sheet.metadata;
  const pairing = pairDocuments(cert, sheet);
  if (sheet.issues.some(i=>i.id==="multiple-sheets")) missing.push("Seleccionar una única planilla judicial");
  if (!pairing.reliable) missing.push("Correspondencia entre el certificado y la planilla");
  if (!calc.covered) missing.push("Cobertura de tasas para todos los períodos");
  if (!start || !notice || !cut || !(start < notice && notice < cut)) missing.push("Secuencia de inicio, notificación y corte");
  if (!cert.rows.length || !sheet.rows.length) missing.push("Facturas de ambos documentos");
  let original = 0, certified = 0, grossRes = 0;
  for (const row of cert.rows) {
    original += row.capital;
    if (row.resarcitorio === undefined || row.total === undefined) missing.push(row.key + " · intereses y total certificados");
    else {
      check(row.key + " · total certificado", roundMoney(row.capital + row.resarcitorio), row.total);
      certified += row.total;
    }
  }
  check("Total del certificado", roundMoney(certified), cert.metadata.declaredTotal);
  for (const match of pairing.rowMatches) {
    const left = match.constancia, right = match.liquidacion;
    if (!left || !right) continue;
    if (!left.dueDate || !right.dueDate || left.inferredFields?.length || right.inferredFields?.length) missing.push(match.key + " · datos de origen sin confirmar");
    else if (left.dueDate !== right.dueDate || left.presentationDate !== right.presentationDate) differences.push(match.key + " · fechas de factura o mora");
    check(match.key + " · capital", left.capital, right.capital);
    if (!left.dueDate || !start) continue;
    const interest = calculateInterest(left.capital, addDays(left.dueDate, 1), start, "resarcitorio");
    const days = interest.tranches.reduce((s, t) => s + t.days, 0);
    const rate = interest.tranches.reduce((s, t) => s + three(t.monthlyRate * 100) * t.days / 30, 0);
    check(match.key + " · días", days, right.reportedDays);
    check(match.key + " · tasa acumulada (%)", three(rate), right.reportedRate, 3);
    const amount = left.capital * rate / 100;
    grossRes += amount;
    check(match.key + " · resarcitorios", roundMoney(amount), right.resarcitorio);
  }
  const res = roundMoney(grossRes);
  check("Subtotal resarcitorio", res, data?.resarcitorioDeclared);
  let prior = 0;
  if (start && notice) {
    const periods = calculateInterest(original, start, addDays(notice, -1), "punitorio");
    const shown = data?.priorTranches ?? [];
    if (shown.length !== periods.tranches.length || !shown.length) missing.push("Desglose completo de los tramos punitorios");
    for (const [i, t] of periods.tranches.entries()) {
      const prefix = "Tramo " + (i + 1) + " (" + t.from + " a " + t.to + ")";
      check(prefix + " · días", t.days, shown[i]?.days);
      const monthly = three(100 * t.monthlyRate);
      check(prefix + " · tasa mensual (%)", monthly, shown[i]?.rate, 3);
      const amount = roundMoney(original * three(monthly * t.days / 30) / 100);
      prior += amount;
      check(prefix + " · punitorios", amount, shown[i]?.interest);
    }
  }
  prior = roundMoney(prior);
  check("Subtotal punitorio", prior, data?.priorPunitorioDeclared);
  const capitalized = roundMoney(original + res + prior);
  check("Capital capitalizado", capitalized, data?.capitalizedDeclared);
  let post: number | undefined;
  if (notice && cut) {
    const periods = calculateInterest(capitalized, notice, addDays(cut, -1), "punitorio");
    check("Días posteriores", daysInclusive(notice, addDays(cut, -1)), data?.postDays);
    if (periods.tranches.length === 1) check("Tasa posterior mensual (%)", three(periods.tranches[0].monthlyRate * 100), data?.postRate, 3);
    else missing.push("Desglose de tasas posteriores");
    post = periods.interest;
  }
  check("Punitorios posteriores", post, data?.postCapitalizationPunitorioDeclared);
  const total = post === undefined ? undefined : roundMoney(capitalized + post);
  check("Total liquidado", total, data?.finalTotalDeclared);
  return { checks, missing, differences, consistent: !missing.length && !differences.length, original: roundMoney(original), res, prior, capitalized, post, total };
}
