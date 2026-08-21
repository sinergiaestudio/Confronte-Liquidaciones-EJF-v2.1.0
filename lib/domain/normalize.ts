const MONTHS: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12,
};

export function normalizeText(value = ""): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function normalizePosition(value?: string): string | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/((?:19|20)\d{2})\s*[-/]\s*(\d{1,3})/);
  if (!match) return normalizeText(value).replace(/\s/g, "-") || undefined;
  const installment = Math.max(1, Number(match[2]));
  return `${match[1]}-${String(installment).padStart(2, "0")}`;
}

export function canonicalDocumentId(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = normalizeText(value);
  const serialMatch = clean.match(/(\d{1,10})\s*$/);
  if (!serialMatch) return clean.replace(/\s/g, "-") || undefined;
  const serial = String(Number(serialMatch[1]));
  const prefix = /(?:NDB|NOTA\s+DE\s+DEBITO)/.test(clean) ? "NDB" : "FAC";
  return `${prefix}-${serial}`;
}

export function parseMoney(value?: string): number | undefined {
  if (!value) return undefined;
  let clean = value
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/[^\d.,()-]/g, "");
  if (!/[0-9]/.test(clean)) return undefined;
  const negative = /^-/.test(clean) || /^\(.*\)$/.test(clean);
  clean = clean.replace(/[()-]/g, "");
  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  if (lastComma > lastDot) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    const decimalLength = clean.length - lastDot - 1;
    if (decimalLength === 1 || decimalLength === 2) {
      clean = clean.replace(/,/g, "");
    } else {
      clean = clean.replace(/[.,]/g, "");
    }
  } else {
    clean = clean.replace(/[.,]/g, "");
  }
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : undefined;
}

export function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const numeric = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return validIso(year, Number(numeric[2]), Number(numeric[1]));
  }
  const iso = value.match(/\b((?:19|20)\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const words = normalizeText(value).match(
    /(\d{1,2})\s+(?:DIAS?\s+DEL?\s+MES\s+DE\s+|DE\s+)?([A-Z]+)\s+(?:DE\s+)?((?:19|20)\d{2})/,
  );
  if (words && MONTHS[words[2]]) {
    return validIso(Number(words[3]), MONTHS[words[2]], Number(words[1]));
  }
  return undefined;
}

function validIso(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return date.toISOString().slice(0, 10);
}

export function formatMoney(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${formatMoneyPlain(Math.abs(value))}`;
}

export function formatMoneyPlain(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(value);
}

export function roundMoney(value: number): number {
  return Math.round((value + Math.sign(value || 1) * Number.EPSILON) * 100) / 100;
}

export function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("es-AR", { timeZone: "UTC" }).format(date);
}

export function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysInclusive(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000) + 1);
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function tokenSimilarity(a?: string, b?: string): number {
  const left = new Set(normalizeText(a).split(" ").filter((token) => token.length > 1));
  const right = new Set(normalizeText(b).split(" ").filter((token) => token.length > 1));
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / new Set([...left, ...right]).size;
}

export function stableId(...parts: Array<string | number | undefined>): string {
  let hash = 2166136261;
  const value = parts.filter(Boolean).join("|");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `id-${(hash >>> 0).toString(36)}`;
}
