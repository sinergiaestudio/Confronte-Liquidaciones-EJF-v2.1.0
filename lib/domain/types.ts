export type DocumentKind = "constancia" | "liquidacion" | "desconocido";

export type DocumentProfile =
  | "estandar"
  | "agip_historica"
  | "capitalizacion_facturas"
  | "capitalizacion_posiciones"
  | "deuda_unica"
  | "desconocido";

export type ConfronteScenario =
  | "estandar"
  | "capitalizacion_facturas"
  | "capitalizacion_posiciones"
  | "deuda_unica";

export type ExtractionMode = "texto" | "ocr" | "mixto";

export type Severity = "info" | "warning" | "critical";

export interface AuditIssue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  field?: string;
  rowId?: string;
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  characterCount: number;
  source: "texto" | "ocr";
}

export interface ExtractionResult {
  pages: ExtractedPage[];
  text: string;
  mode: ExtractionMode;
  needsOcr: boolean;
  quality: number;
  fingerprint: string;
}

export interface DocumentMetadata {
  adjudication?: string;
  certificate?: string;
  caseNumber?: string;
  taxOrConcept?: string;
  court?: string;
  clerkOffice?: string;
  documentDate?: string;
  suitStartDate?: string;
  notificationDate?: string;
  liquidationDate?: string;
  declaredTotal?: number;
}

export interface SpecialDocumentData {
  priorPunitorioDeclared?: number;
  capitalizedDeclared?: number;
  postCapitalizationPunitorioDeclared?: number;
  finalTotalDeclared?: number;
  resarcitorioFrom?: string;
  resarcitorioTo?: string;
  punitorioFrom?: string;
  punitorioTo?: string;
}

export interface DebtRow {
  id: string;
  key: string;
  position?: string;
  documentId?: string;
  originalDocumentId?: string;
  concept?: string;
  presentationDate?: string;
  dueDate?: string;
  capital: number;
  resarcitorio?: number;
  punitorio?: number;
  total?: number;
  sourcePage?: number;
  confidence: number;
  inferredFields?: string[];
  notes?: string[];
}

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileSize: number;
  kind: DocumentKind;
  profile: DocumentProfile;
  metadata: DocumentMetadata;
  special?: SpecialDocumentData;
  rows: DebtRow[];
  extraction: ExtractionResult;
  confidence: number;
  issues: AuditIssue[];
  reviewed: boolean;
}

export interface PairCheck {
  id: string;
  label: string;
  status: "ok" | "warning" | "critical" | "missing";
  left?: string;
  right?: string;
  detail: string;
}

export interface RowMatch {
  key: string;
  constancia?: DebtRow;
  liquidacion?: DebtRow;
  capitalDifference?: number;
  status: "ok" | "warning" | "critical" | "missing";
}

export interface PairingResult {
  checks: PairCheck[];
  rowMatches: RowMatch[];
  reliable: boolean;
  score: number;
}

export interface RatePeriod {
  from: string;
  to: string;
  monthlyRate: number;
  kind: "resarcitorio" | "punitorio";
  sourceLabel: string;
}

export interface InterestTranche {
  from: string;
  to: string;
  days: number;
  monthlyRate: number;
  interest: number;
  sourceLabel: string;
}

export interface InterestCalculation {
  capital: number;
  from: string;
  to: string;
  kind: "resarcitorio" | "punitorio";
  interest: number;
  tranches: InterestTranche[];
  covered: boolean;
  uncoveredDates: string[];
}

export interface RecalculatedRow {
  key: string;
  capital: number;
  actualCapital?: number;
  capitalDifference?: number;
  expectedResarcitorio: number;
  actualResarcitorio?: number;
  resarcitorioDifference?: number;
  expectedPunitorio: number;
  actualPunitorio?: number;
  punitorioDifference?: number;
  expectedTotal: number;
  actualTotal?: number;
  totalDifference?: number;
  resarcitorioTranches: InterestTranche[];
  punitorioTranches: InterestTranche[];
  covered: boolean;
  notes: string[];
}

export interface ConfronteCalculation {
  scenario: ConfronteScenario;
  rows: RecalculatedRow[];
  covered: boolean;
  totalCapital: number;
  expectedResarcitorio: number;
  actualResarcitorio?: number;
  expectedPunitorio: number;
  actualPunitorio?: number;
  expectedCapitalized?: number;
  actualCapitalized?: number;
  expectedPostCapitalizationPunitorio?: number;
  actualPostCapitalizationPunitorio?: number;
  expectedTotal: number;
  actualTotal?: number;
  postCapitalizationTranches: InterestTranche[];
  messages: string[];
}
