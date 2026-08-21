import { normalizeText, roundMoney } from "../domain/normalize";
import type { PairCheck, PairingResult, ParsedDocument, RowMatch } from "../domain/types";

function valueCheck(
  id: string,
  label: string,
  left: string | undefined,
  right: string | undefined,
  normalizer: (value?: string) => string | undefined = (value) => value,
): PairCheck {
  if (!left || !right) {
    return { id, label, left, right, status: "missing", detail: "El dato no pudo verificarse en ambos documentos." };
  }
  const equal = normalizer(left) === normalizer(right);
  return {
    id,
    label,
    left,
    right,
    status: equal ? "ok" : "critical",
    detail: equal ? "Coincidencia exacta." : "Los documentos informan valores distintos.",
  };
}

export function pairDocuments(left: ParsedDocument, right: ParsedDocument): PairingResult {
  const checks: PairCheck[] = [{
    id: "tipo-documental",
    label: "Pareja documental",
    left: left.kind,
    right: right.kind,
    status: left.kind === "constancia" && right.kind === "liquidacion" ? "ok" : "critical",
    detail: left.kind === "constancia" && right.kind === "liquidacion"
      ? "Se confronta una constancia con una liquidación."
      : "La pareja debe contener una constancia y una liquidación.",
  }];

  if (left.metadata.adjudication || right.metadata.adjudication) {
    checks.push(valueCheck("adjudicacion", "Adjudicación", left.metadata.adjudication, right.metadata.adjudication, (value) => value?.replace(/\D/g, "")));
  }
  if (left.metadata.certificate || right.metadata.certificate) {
    checks.push(valueCheck("certificado", "Certificado", left.metadata.certificate, right.metadata.certificate, (value) => value?.replace(/\D/g, "")));
  }

  if (left.profile !== right.profile && left.profile !== "desconocido" && right.profile !== "desconocido") {
    checks.push({
      id: "perfil",
      label: "Tipo de liquidación",
      left: left.profile,
      right: right.profile,
      status: "warning",
      detail: "Uno de los documentos define un perfil distinto. El motor adopta el escenario especial explícito y mantiene esta advertencia.",
    });
  }

  const leftByKey = new Map(left.rows.map((row) => [row.key, row]));
  const rightByKey = new Map(right.rows.map((row) => [row.key, row]));
  const keys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort();
  const rowMatches: RowMatch[] = keys.map((key) => {
    const constancia = leftByKey.get(key);
    const liquidacion = rightByKey.get(key);
    if (!constancia || !liquidacion) return { key, constancia, liquidacion, status: "missing" };
    const capitalDifference = roundMoney(liquidacion.capital - constancia.capital);
    return {
      key,
      constancia,
      liquidacion,
      capitalDifference,
      status: Math.abs(capitalDifference) < 0.01 ? "ok" : "critical",
    };
  });

  const rowStructureMatches = rowMatches.length > 0 && rowMatches.every((row) => row.status === "ok");
  const explicitIdentifierMatches = checks.some((check) => ["adjudicacion", "certificado"].includes(check.id) && check.status === "ok");
  const profileCompatible = left.profile === right.profile ||
    left.profile === "desconocido" ||
    right.profile === "desconocido" ||
    new Set([left.profile, right.profile]).size === 2 && [left.profile, right.profile].every((profile) => ["agip_historica", "estandar"].includes(profile));
  const structuralIdentity = rowStructureMatches && profileCompatible && (rowMatches.length >= 2 || left.profile === "deuda_unica");

  if (!checks.some((check) => ["adjudicacion", "certificado"].includes(check.id))) {
    checks.push({
      id: "correspondencia-estructural",
      label: "Correspondencia estructural",
      status: structuralIdentity ? "ok" : "missing",
      detail: structuralIdentity
        ? "La identidad se sostiene por perfil, claves y capitales coincidentes."
        : "No hay adjudicación o certificado común y la estructura no alcanza para identificar la pareja.",
    });
  }

  const criticalChecks = checks.filter((check) => check.status === "critical").length;
  const missingRows = rowMatches.filter((row) => row.status === "missing").length;
  const conflictingRows = rowMatches.filter((row) => row.status === "critical").length;
  const checkPoints = checks.reduce((sum, check) => sum + (check.status === "ok" ? 1 : check.status === "warning" ? 0.5 : 0), 0);
  const rowPoints = rowMatches.reduce((sum, row) => sum + (row.status === "ok" ? 1 : 0), 0);
  const denominator = Math.max(1, checks.length + rowMatches.length);
  const score = Math.round(((checkPoints + rowPoints) / denominator) * 100);
  const positiveIdentity = explicitIdentifierMatches || structuralIdentity;

  return {
    checks,
    rowMatches,
    reliable: criticalChecks === 0 && missingRows === 0 && conflictingRows === 0 && positiveIdentity && left.rows.length > 0 && right.rows.length > 0,
    score,
  };
}

export function buildDocumentSummary(document: ParsedDocument): string {
  const parts = [document.metadata.adjudication, document.metadata.certificate, document.metadata.caseNumber]
    .filter(Boolean)
    .map((value) => normalizeText(value));
  return parts.join(" · ");
}
