"use client";

import { useMemo, useRef, useState } from "react";
import { recalculatePair } from "../../lib/confronte/calculate";
import { pairDocuments } from "../../lib/confronte/pairing";
import {
  canonicalDocumentId,
  formatDate,
  formatMoney,
  formatMoneyPlain,
  normalizePosition,
  parseMoney,
  roundMoney,
  stableId,
} from "../../lib/domain/normalize";
import type {
  ConfronteCalculation,
  ConfronteScenario,
  DebtRow,
  InterestTranche,
  ParsedDocument,
  RecalculatedRow,
} from "../../lib/domain/types";
import { parseDocument } from "../../lib/parsers/parse-document";
import { extractPdfText, extractPdfWithOcr } from "../../lib/pdf/extract";
import { Icon } from "./Icons";

type Side = "constancia" | "liquidacion";
type SlotStatus = "idle" | "processing" | "ready" | "error";

interface SlotState {
  file?: File;
  document?: ParsedDocument;
  status: SlotStatus;
  message?: string;
  progress: number;
  error?: string;
}

const EMPTY_SLOT: SlotState = { status: "idle", progress: 0 };
const MAX_FILE_SIZE = 40 * 1024 * 1024;
const PROFILE_LABELS: Record<ParsedDocument["profile"], string> = {
  estandar: "Liquidación estándar",
  agip_historica: "Constancia AGIP histórica",
  capitalizacion_facturas: "Ejecución especial · capitalización por comprobantes",
  capitalizacion_posiciones: "Ejecución especial · capitalización por posiciones",
  deuda_unica: "Ejecución especial · deuda única",
  desconocido: "Perfil no reconocido",
};
const SCENARIO_LABELS: Record<ConfronteScenario, string> = {
  estandar: "Ejecución estándar",
  capitalizacion_facturas: "Especial · capitalización por comprobantes",
  capitalizacion_posiciones: "Especial · capitalización por posiciones",
  deuda_unica: "Especial · deuda única",
};
const KIND_LABELS: Record<ParsedDocument["kind"], string> = {
  constancia: "Constancia / certificado",
  liquidacion: "Liquidación",
  desconocido: "Documento no reconocido",
};

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRate(value: number): string {
  return `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 3, maximumFractionDigits: 6 }).format(value * 100)}% mensual`;
}

function difference(actual?: number, expected?: number): number | undefined {
  return actual === undefined || expected === undefined ? undefined : roundMoney(actual - expected);
}

function download(name: string, contents: string, type: string) {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function MoneyInput({ value, label, onCommit }: {
  value?: number;
  label: string;
  onCommit: (value?: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const displayedValue = draft ?? (value === undefined ? "" : formatMoneyPlain(value));
  const commit = () => {
    if (draft === null) return;
    const parsed = parseMoney(draft);
    onCommit(parsed);
    setDraft(null);
  };
  return (
    <span className="money-input">
      <span aria-hidden="true">$</span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={displayedValue}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
      />
    </span>
  );
}

function UploadCard({ side, state, onFile, onRemove, onOcr }: {
  side: Side;
  state: SlotState;
  onFile: (file: File) => void;
  onRemove: () => void;
  onOcr: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const title = side === "constancia" ? "Constancia de deuda" : "Liquidación mandataria";
  const eyebrow = side === "constancia" ? "Documento base" : "Documento a controlar";
  const acceptFile = (file?: File) => file && onFile(file);

  return (
    <article className={`upload-card ${dragging ? "is-dragging" : ""} ${state.status === "ready" ? "is-ready" : ""}`}>
      <div className="upload-card__heading">
        <span className="step-number">{side === "constancia" ? "A" : "B"}</span>
        <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>
        {state.document && <span className={`quality-badge quality-badge--${state.document.extraction.mode === "ocr" ? "review" : "good"}`}>{state.document.extraction.mode === "ocr" ? "OCR local" : "Texto PDF"}</span>}
      </div>

      {state.status === "idle" || state.status === "error" ? (
        <button
          className="drop-zone"
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}
        >
          <span className="drop-zone__icon"><Icon name="upload" /></span>
          <strong>Arrastre el PDF o selecciónelo</strong>
          <span>Hasta 40 MB · el archivo no sale de este dispositivo</span>
        </button>
      ) : state.status === "processing" ? (
        <div className="processing-box" aria-live="polite">
          <span className="processing-box__icon"><Icon name="search" /></span>
          <div><strong>{state.message ?? "Analizando documento"}</strong><span>{Math.round(state.progress * 100)}% completado</span></div>
          <div className="progress-track"><span style={{ width: `${Math.max(4, state.progress * 100)}%` }} /></div>
        </div>
      ) : state.document ? (
        <div className="file-summary">
          <span className="file-summary__icon"><Icon name="document" /></span>
          <div className="file-summary__main"><strong title={state.document.fileName}>{state.document.fileName}</strong><span>{KIND_LABELS[state.document.kind]} · {state.document.rows.length} renglones</span><span>{PROFILE_LABELS[state.document.profile]}</span></div>
          <div className="file-summary__actions">{state.file && <button className="text-button" type="button" onClick={onOcr}>Releer con OCR</button>}<button className="text-button" type="button" onClick={onRemove}>Cambiar</button></div>
        </div>
      ) : null}

      {state.error && <p className="inline-alert inline-alert--critical"><Icon name="warning" />{state.error}</p>}
      <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,.pdf" onChange={(event) => acceptFile(event.target.files?.[0])} />
    </article>
  );
}

function MetadataEditor({ document, onChange }: { document: ParsedDocument; onChange: (document: ParsedDocument) => void }) {
  const setMetadata = (field: keyof ParsedDocument["metadata"], value: string) => {
    onChange({ ...document, reviewed: false, metadata: { ...document.metadata, [field]: value || undefined } });
  };
  const setSpecial = (field: NonNullable<ParsedDocument["special"]> extends infer T ? keyof T : never, value: string) => {
    onChange({ ...document, reviewed: false, special: { ...document.special, [field]: value || undefined } });
  };
  const isCapitalization = document.profile === "capitalizacion_facturas" || document.profile === "capitalizacion_posiciones";
  const identifier = isCapitalization
    ? { key: "certificate" as const, label: "Certificado", value: document.metadata.certificate }
    : { key: "adjudication" as const, label: "Adjudicación", value: document.metadata.adjudication };
  const dates = document.kind === "liquidacion"
    ? [
        { key: "suitStartDate" as const, label: "Inicio de juicio", value: document.metadata.suitStartDate },
        ...(isCapitalization ? [{ key: "notificationDate" as const, label: "Notificación de demanda", value: document.metadata.notificationDate }] : []),
        { key: "liquidationDate" as const, label: "Liquidación", value: document.metadata.liquidationDate },
      ]
    : document.profile === "agip_historica"
      ? [{ key: "interestCutoffDate" as const, label: "Intereses certificados al", value: document.metadata.interestCutoffDate }]
      : [{ key: "documentDate" as const, label: "Fecha del documento", value: document.metadata.documentDate }];

  return (
    <div className="metadata-grid">
      <label><span>{identifier.label}</span><input value={identifier.value ?? ""} onChange={(event) => setMetadata(identifier.key, event.target.value)} /></label>
      <label><span>Expediente</span><input value={document.metadata.caseNumber ?? ""} onChange={(event) => setMetadata("caseNumber", event.target.value)} /></label>
      {document.kind === "liquidacion" && document.profile === "deuda_unica" ? (
        <>
          <label><span>Resarcitorio desde</span><input type="date" value={document.special?.resarcitorioFrom ?? ""} onChange={(event) => setSpecial("resarcitorioFrom", event.target.value)} /></label>
          <label><span>Resarcitorio hasta</span><input type="date" value={document.special?.resarcitorioTo ?? ""} onChange={(event) => setSpecial("resarcitorioTo", event.target.value)} /></label>
          <label><span>Punitorio desde</span><input type="date" value={document.special?.punitorioFrom ?? ""} onChange={(event) => setSpecial("punitorioFrom", event.target.value)} /></label>
          <label><span>Punitorio hasta</span><input type="date" value={document.special?.punitorioTo ?? ""} onChange={(event) => setSpecial("punitorioTo", event.target.value)} /></label>
        </>
      ) : dates.map((item) => <label key={item.key}><span>{item.label}</span><input type="date" value={item.value ?? ""} onChange={(event) => setMetadata(item.key, event.target.value)} /></label>)}
    </div>
  );
}

function ReviewTable({ document, onChange }: { document: ParsedDocument; onChange: (document: ParsedDocument) => void }) {
  const invoiceProfile = document.profile === "capitalizacion_facturas";
  const historicalCertificate = document.kind === "constancia" && document.profile === "agip_historica";
  const updateRow = (rowId: string, field: keyof DebtRow, value: string | number | undefined) => {
    const rows = document.rows.map((row) => {
      if (row.id !== rowId) return row;
      if (["capital", "resarcitorio", "punitorio", "total"].includes(field)) {
        const numeric = typeof value === "number" ? value : undefined;
        return { ...row, [field]: field === "capital" ? numeric ?? 0 : numeric, confidence: 1, inferredFields: row.inferredFields?.filter((item) => item !== field) };
      }
      const text = String(value ?? "");
      if (field === "position") {
        const position = normalizePosition(text);
        return { ...row, position, key: position ?? row.key, confidence: 1, inferredFields: row.inferredFields?.filter((item) => item !== field) };
      }
      if (field === "originalDocumentId") {
        const documentId = canonicalDocumentId(text);
        return { ...row, originalDocumentId: text || undefined, documentId, key: documentId ?? row.key, confidence: 1, inferredFields: row.inferredFields?.filter((item) => item !== field) };
      }
      return { ...row, [field]: text || undefined, confidence: 1, inferredFields: row.inferredFields?.filter((item) => item !== field) };
    });
    onChange({ ...document, rows, reviewed: false });
  };

  return (
    <div className="table-shell">
      <table className="review-table">
        <thead><tr><th>{invoiceProfile ? "Comprobante" : "Posición"}</th><th>Vencimiento / mora</th><th className="number-cell">Capital</th>{historicalCertificate && <th className="number-cell">Total certificado</th>}{document.kind === "liquidacion" && <th className="number-cell">Resarcitorio</th>}{document.kind === "liquidacion" && <th className="number-cell">Punitorio</th>}{document.kind === "liquidacion" && <th className="number-cell">Total</th>}<th>Lectura</th><th aria-label="Acciones" /></tr></thead>
        <tbody>{document.rows.map((row) => (
          <tr key={row.id} className={row.inferredFields?.length ? "row--review" : ""}>
            <td><input value={(invoiceProfile ? row.originalDocumentId : row.position) ?? ""} onChange={(event) => updateRow(row.id, invoiceProfile ? "originalDocumentId" : "position", event.target.value)} /></td>
            <td><input type="date" value={row.dueDate ?? ""} onChange={(event) => updateRow(row.id, "dueDate", event.target.value)} /></td>
            <td className="number-cell"><MoneyInput label={`Capital ${row.key}`} value={row.capital} onCommit={(value) => updateRow(row.id, "capital", value)} /></td>
            {historicalCertificate && <td className="number-cell"><MoneyInput label={`Total certificado ${row.key}`} value={row.total} onCommit={(value) => updateRow(row.id, "total", value)} /></td>}
            {document.kind === "liquidacion" && <td className="number-cell"><MoneyInput label={`Resarcitorio ${row.key}`} value={row.resarcitorio} onCommit={(value) => updateRow(row.id, "resarcitorio", value)} /></td>}
            {document.kind === "liquidacion" && <td className="number-cell"><MoneyInput label={`Punitorio ${row.key}`} value={row.punitorio} onCommit={(value) => updateRow(row.id, "punitorio", value)} /></td>}
            {document.kind === "liquidacion" && <td className="number-cell"><MoneyInput label={`Total ${row.key}`} value={row.total} onCommit={(value) => updateRow(row.id, "total", value)} /></td>}
            <td><span className={`confidence confidence--${row.inferredFields?.length ? "review" : row.confidence >= 0.85 ? "high" : "medium"}`}>{row.inferredFields?.length ? "Inferido" : percent(row.confidence)}</span></td>
            <td><button className="row-remove" type="button" aria-label={`Eliminar ${row.key}`} onClick={() => onChange({ ...document, reviewed: false, rows: document.rows.filter((item) => item.id !== row.id) })}>×</button></td>
          </tr>
        ))}</tbody>
      </table>
      <button className="add-row" type="button" onClick={() => {
        const key = `MANUAL-${document.rows.length + 1}`;
        onChange({ ...document, reviewed: false, rows: [...document.rows, { id: stableId(document.id, key, Date.now()), key, position: invoiceProfile ? undefined : key, originalDocumentId: invoiceProfile ? key : undefined, capital: 0, confidence: 1 }] });
      }}>+ Agregar renglón</button>
    </div>
  );
}

function DocumentReview({ title, document, counterpart, onChange }: {
  title: string;
  document: ParsedDocument;
  counterpart?: ParsedDocument;
  onChange: (document: ParsedDocument) => void;
}) {
  const criticalCount = document.issues.filter((issue) => issue.severity === "critical").length;
  const missingCounterpartRows = counterpart?.rows.filter((row) => !document.rows.some((item) => item.key === row.key)) ?? [];
  const isSpecial = ["capitalizacion_facturas", "capitalizacion_posiciones", "deuda_unica"].includes(document.profile);
  const completeFromCounterpart = () => {
    const additions: DebtRow[] = missingCounterpartRows.map((row, index) => ({
      id: stableId(document.id, "contraparte", row.key, index),
      key: row.key,
      position: row.position,
      documentId: row.documentId,
      originalDocumentId: row.originalDocumentId,
      concept: row.concept,
      presentationDate: row.presentationDate,
      dueDate: row.dueDate,
      capital: row.capital,
      confidence: 0.35,
      inferredFields: [row.position ? "position" : "documentId", "dueDate", "capital"],
      notes: ["Renglón creado desde el documento contraparte. Los intereses no fueron inferidos."],
    }));
    onChange({ ...document, reviewed: false, rows: [...document.rows, ...additions] });
  };

  return (
    <article className="review-card">
      <div className="review-card__header"><div><p className="eyebrow">{title}</p><h3>{document.fileName}</h3><p>{PROFILE_LABELS[document.profile]} · confianza documental {percent(document.confidence)}</p></div><span className={`quality-score ${criticalCount ? "quality-score--critical" : ""}`}>{criticalCount ? `${criticalCount} bloqueos` : "Lectura completa"}</span></div>
      {isSpecial && <div className="special-detected"><Icon name="spark" /><div><strong>Ejecución especial detectada</strong><span>El confronte aplicará automáticamente el tratamiento de {PROFILE_LABELS[document.profile].replace("Ejecución especial · ", "")}.</span></div></div>}
      {document.issues.length > 0 && <div className="issue-list">{document.issues.map((issue) => <div className={`issue issue--${issue.severity}`} key={issue.id}><Icon name={issue.severity === "critical" ? "warning" : "info"} /><div><strong>{issue.title}</strong><span>{issue.detail}</span></div></div>)}</div>}
      {missingCounterpartRows.length > 0 && <div className="recovery-bar"><div><Icon name="refresh" /><span><strong>{missingCounterpartRows.length} renglón{missingCounterpartRows.length === 1 ? "" : "es"} visible{missingCounterpartRows.length === 1 ? "" : "s"} solo en el otro documento</strong><small>Puede crear filas de revisión con clave, fecha y capital. Los intereses quedarán vacíos.</small></span></div><button type="button" onClick={completeFromCounterpart}>Completar desde contraparte</button></div>}
      <MetadataEditor document={document} onChange={onChange} />
      <ReviewTable document={document} onChange={onChange} />
      <div className="review-card__footer"><p><Icon name="info" /> Los campos amarillos o inferidos necesitan control humano.</p><label className="confirm-check"><input type="checkbox" checked={document.reviewed} onChange={(event) => onChange({ ...document, reviewed: event.target.checked })} /><span><Icon name="check" /> Revisé los datos de este documento</span></label></div>
    </article>
  );
}

function TrancheTable({ title, capital, tranches, reported, certified }: {
  title: string;
  capital: number;
  tranches: InterestTranche[];
  reported?: number;
  certified?: number;
}) {
  const continuation = roundMoney(tranches.reduce((sum, tranche) => sum + tranche.interest, 0));
  const total = roundMoney((certified ?? 0) + continuation);
  return (
    <section className="tranche-block">
      <div className="tranche-block__heading"><div><strong>{title}</strong><span>Base {formatMoney(capital)}</span></div><b>{formatMoney(total)}</b></div>
      {certified !== undefined && <div className="certified-interest"><span>Interés ya certificado</span><code>{formatMoney(certified)}</code></div>}
      {tranches.length ? <div className="table-shell"><table className="tranche-table"><thead><tr><th>Desde</th><th>Hasta</th><th>Días</th><th>Tasa mensual</th><th>Ecuación e interés</th></tr></thead><tbody>{tranches.map((tranche) => <tr key={`${title}-${tranche.from}-${tranche.to}`}><td>{formatDate(tranche.from)}</td><td>{formatDate(tranche.to)}</td><td>{tranche.days}</td><td>{formatRate(tranche.monthlyRate)}</td><td className="equation-cell"><code>{formatMoney(capital)} × {formatRate(tranche.monthlyRate).replace(" mensual", "")} × {tranche.days} / 30</code><strong>= {formatMoney(tranche.interest)}</strong></td></tr>)}</tbody></table></div> : <p className="empty-tranches">No hay tramos adicionales calculables.</p>}
      <div className="formula-line"><span>{certified !== undefined ? `${formatMoney(certified)} certificado + ${formatMoney(continuation)} de continuación = ${formatMoney(total)}` : `Suma de tramos calculados = ${formatMoney(total)}`}</span><span>Informado en la liquidación: <strong>{formatMoney(reported)}</strong></span></div>
    </section>
  );
}

function PositionEquation({ row }: { row: RecalculatedRow }) {
  const actualComplete = row.actualCapital !== undefined && row.actualResarcitorio !== undefined && row.actualPunitorio !== undefined;
  const informedTotal = row.actualTotal ?? (actualComplete
    ? roundMoney(row.actualCapital! + row.actualResarcitorio! + row.actualPunitorio!)
    : undefined);
  return (
    <div className="position-equation">
      <div><span>Ecuación calculada</span><code>{formatMoney(row.capital)} + {formatMoney(row.expectedResarcitorio)} + {formatMoney(row.expectedPunitorio)} = <strong>{formatMoney(row.expectedTotal)}</strong></code></div>
      <div><span>Ecuación informada</span>{actualComplete ? <code>{formatMoney(row.actualCapital)} + {formatMoney(row.actualResarcitorio)} + {formatMoney(row.actualPunitorio)} = <strong>{formatMoney(informedTotal)}</strong></code> : <code>Faltan componentes informados en la liquidación.</code>}</div>
    </div>
  );
}

function ComparisonGrid({ rows }: { rows: Array<{ label: string; expected?: number; actual?: number }> }) {
  return (
    <div className="comparison-grid">
      {rows.map((row) => {
        const delta = difference(row.actual, row.expected);
        return <div key={row.label}><span>{row.label}</span><dl><div><dt>Calculado</dt><dd>{formatMoney(row.expected)}</dd></div><div><dt>Informado</dt><dd>{formatMoney(row.actual)}</dd></div><div><dt>Diferencia</dt><dd className={delta !== undefined && Math.abs(delta) >= 0.01 ? "difference" : ""}>{formatMoney(delta)}</dd></div></dl></div>;
      })}
    </div>
  );
}

function GeneralReport({ calculation, constancia, liquidacion }: {
  calculation: ConfronteCalculation;
  constancia: ParsedDocument;
  liquidacion: ParsedDocument;
}) {
  const actualCapital = roundMoney(liquidacion.rows.reduce((sum, row) => sum + row.capital, 0));
  const comparisons = calculation.scenario === "capitalizacion_facturas" || calculation.scenario === "capitalizacion_posiciones"
    ? [
        { label: "Capital original", expected: calculation.totalCapital, actual: actualCapital },
        { label: "Intereses resarcitorios", expected: calculation.expectedResarcitorio, actual: calculation.actualResarcitorio },
        { label: "Punitorio hasta la notificación", expected: calculation.expectedPunitorio, actual: calculation.actualPunitorio },
        { label: "Total capitalizado", expected: calculation.expectedCapitalized, actual: calculation.actualCapitalized },
        { label: "Punitorio sobre capital capitalizado", expected: calculation.expectedPostCapitalizationPunitorio, actual: calculation.actualPostCapitalizationPunitorio },
        { label: "Liquidación total", expected: calculation.expectedTotal, actual: calculation.actualTotal },
      ]
    : [
        { label: "Capital", expected: calculation.totalCapital, actual: actualCapital },
        { label: "Intereses resarcitorios", expected: calculation.expectedResarcitorio, actual: calculation.actualResarcitorio },
        { label: "Intereses punitorios", expected: calculation.expectedPunitorio, actual: calculation.actualPunitorio },
        { label: "Liquidación total", expected: calculation.expectedTotal, actual: calculation.actualTotal },
      ];
  const identifier = constancia.metadata.adjudication ?? liquidacion.metadata.adjudication ?? constancia.metadata.certificate ?? liquidacion.metadata.certificate;

  return (
    <details className="trace-panel report-panel">
      <summary><span><Icon name="document" /><span><strong>Desplegar resumen pormenorizado del cálculo</strong><small>Escenario aplicado, fechas, componentes globales y diferencias</small></span></span><Icon name="chevron" /></summary>
      <div className="report-body">
        <div className="report-facts"><div><span>Modo aplicado</span><strong>{SCENARIO_LABELS[calculation.scenario]}</strong></div><div><span>Identificador</span><strong>{identifier ?? "No informado"}</strong></div><div><span>Inicio de juicio</span><strong>{formatDate(liquidacion.metadata.suitStartDate)}</strong></div><div><span>Notificación</span><strong>{formatDate(liquidacion.metadata.notificationDate)}</strong></div><div><span>Fecha de liquidación</span><strong>{formatDate(liquidacion.metadata.liquidationDate ?? liquidacion.special?.punitorioTo)}</strong></div><div><span>Renglones calculados</span><strong>{calculation.rows.length}</strong></div></div>
        {calculation.messages.map((message) => <div className="coverage-alert" key={message}><Icon name="warning" /><span><strong>Dato necesario</strong>{message}</span></div>)}
        <ComparisonGrid rows={comparisons} />
        {calculation.postCapitalizationTranches.length > 0 && <TrancheTable title="Punitorio posterior sobre el capital capitalizado" capital={calculation.expectedCapitalized ?? 0} tranches={calculation.postCapitalizationTranches} reported={calculation.actualPostCapitalizationPunitorio} />}
      </div>
    </details>
  );
}

function rowStatus(row: RecalculatedRow): { label: string; className: string } {
  if (!row.covered) return { label: "Cobertura incompleta", className: "review" };
  const tolerance = Math.max(0.01, Math.abs(row.expectedTotal) * 0.05);
  const differences = [row.capitalDifference, row.resarcitorioDifference, row.punitorioDifference, row.totalDifference].filter((value): value is number => value !== undefined);
  if (!differences.length) return { label: "Control global", className: "review" };
  return differences.some((value) => Math.abs(value) > tolerance)
    ? { label: "Revisar", className: "critical" }
    : { label: "Dentro de tolerancia", className: "ok" };
}

function PositionDetails({ rows }: { rows: RecalculatedRow[] }) {
  return (
    <details className="trace-panel positions-panel">
      <summary><span><Icon name="search" /><span><strong>Desplegar detalle por posición</strong><small>Capital, intereses, diferencias y todos los tramos de cada renglón</small></span></span><Icon name="chevron" /></summary>
      <div className="position-audit-list">{rows.map((row) => {
        const status = rowStatus(row);
        return (
          <details className="position-audit" key={row.key}>
            <summary><span><code>{row.key}</code><small className={`position-status position-status--${status.className}`}>{status.label}</small></span><span><b>{formatMoney(row.expectedTotal)}</b><small>total calculado</small></span><Icon name="chevron" /></summary>
            <div className="position-audit__body">
              <ComparisonGrid rows={[
                { label: "Capital", expected: row.capital, actual: row.actualCapital },
                { label: "Resarcitorio", expected: row.expectedResarcitorio, actual: row.actualResarcitorio },
                { label: "Punitorio", expected: row.expectedPunitorio, actual: row.actualPunitorio },
                { label: "Subtotal / total", expected: row.expectedTotal, actual: row.actualTotal },
              ]} />
              <PositionEquation row={row} />
              {row.notes.length > 0 && <div className="position-notes">{row.notes.map((note) => <p key={note}><Icon name="info" />{note}</p>)}</div>}
              <div className="tranche-grid"><TrancheTable title="Intereses resarcitorios" capital={row.capital} tranches={row.resarcitorioTranches} reported={row.actualResarcitorio} certified={row.certifiedResarcitorio} /><TrancheTable title="Intereses punitorios" capital={row.capital} tranches={row.punitorioTranches} reported={row.actualPunitorio} /></div>
            </div>
          </details>
        );
      })}</div>
      <p className="trace-note"><Icon name="info" /> Cobertura normativa cargada: 01/01/2010–31/12/2026. Fuera de ese rango la aplicación muestra el diagnóstico, pero no valida el total.</p>
    </details>
  );
}

function sanitizeImportedDocument(raw: ParsedDocument): ParsedDocument {
  const reparsed = raw.extraction ? parseDocument({ fileName: raw.fileName, fileSize: raw.fileSize, extraction: raw.extraction }) : raw;
  const metadata = {
    adjudication: raw.metadata?.adjudication ?? reparsed.metadata.adjudication,
    certificate: raw.metadata?.certificate ?? reparsed.metadata.certificate,
    caseNumber: raw.metadata?.caseNumber ?? reparsed.metadata.caseNumber,
    taxOrConcept: raw.metadata?.taxOrConcept ?? reparsed.metadata.taxOrConcept,
    court: raw.metadata?.court ?? reparsed.metadata.court,
    clerkOffice: raw.metadata?.clerkOffice ?? reparsed.metadata.clerkOffice,
    documentDate: raw.metadata?.documentDate ?? reparsed.metadata.documentDate,
    suitStartDate: raw.metadata?.suitStartDate ?? reparsed.metadata.suitStartDate,
    notificationDate: raw.metadata?.notificationDate ?? reparsed.metadata.notificationDate,
    liquidationDate: raw.metadata?.liquidationDate ?? reparsed.metadata.liquidationDate,
    interestCutoffDate: raw.metadata?.interestCutoffDate ?? reparsed.metadata.interestCutoffDate,
    declaredTotal: raw.metadata?.declaredTotal ?? reparsed.metadata.declaredTotal,
  };
  return { ...reparsed, rows: raw.rows ?? reparsed.rows, metadata, special: raw.special ?? reparsed.special, reviewed: Boolean(raw.reviewed) };
}

export function ConfronteApp() {
  const [slots, setSlots] = useState<Record<Side, SlotState>>({ constancia: EMPTY_SLOT, liquidacion: EMPTY_SLOT });
  const sessionInput = useRef<HTMLInputElement>(null);
  const left = slots.constancia.document;
  const right = slots.liquidacion.document;
  const bothReady = Boolean(left && right);
  const ordered = useMemo(() => {
    if (!left || !right) return undefined;
    const constancia = left.kind === "constancia" ? left : right.kind === "constancia" ? right : left;
    const liquidacion = right.kind === "liquidacion" ? right : left.kind === "liquidacion" ? left : right;
    return { constancia, liquidacion };
  }, [left, right]);
  const pairing = useMemo(() => ordered ? pairDocuments(ordered.constancia, ordered.liquidacion) : undefined, [ordered]);
  const calculation = useMemo(() => ordered ? recalculatePair(ordered.constancia, ordered.liquidacion) : undefined, [ordered]);
  const allReviewed = Boolean(left?.reviewed && right?.reviewed);
  const calculationReady = Boolean(calculation?.rows.length);
  const calculationCovered = Boolean(calculation?.covered);
  const totalDifference = calculation?.actualTotal === undefined ? undefined : difference(calculation.actualTotal, calculation.expectedTotal);
  const calculationTolerance = roundMoney(Math.abs(calculation?.actualTotal ?? 0) * 0.05);
  const calculationWithinTolerance = totalDifference !== undefined && Math.abs(totalDifference) <= calculationTolerance;
  const finalTrustworthy = Boolean(pairing?.reliable && allReviewed && calculationReady && calculationCovered && calculationWithinTolerance);

  const setSlot = (side: Side, update: SlotState | ((current: SlotState) => SlotState)) => setSlots((current) => ({ ...current, [side]: typeof update === "function" ? update(current[side]) : update }));
  const processFile = async (side: Side, file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") return setSlot(side, { ...EMPTY_SLOT, status: "error", error: "Seleccione un archivo PDF." });
    if (file.size > MAX_FILE_SIZE) return setSlot(side, { ...EMPTY_SLOT, status: "error", error: "El PDF supera el límite de 40 MB." });
    setSlot(side, { file, status: "processing", progress: 0.02, message: "Validando archivo" });
    const updateProgress = (message: string, progress: number) => setSlot(side, (current) => ({ ...current, message, progress }));
    try {
      let extraction = await extractPdfText(file, updateProgress);
      if (extraction.needsOcr) extraction = await extractPdfWithOcr(file, updateProgress);
      const document = parseDocument({ fileName: file.name, fileSize: file.size, extraction });
      setSlot(side, { file, document, status: "ready", progress: 1, message: "Documento analizado" });
    } catch (error) {
      setSlot(side, { file, status: "error", progress: 0, error: error instanceof Error ? error.message : "No fue posible leer el PDF." });
    }
  };
  const rerunOcr = async (side: Side) => {
    const file = slots[side].file;
    if (!file) return;
    setSlot(side, (current) => ({ ...current, status: "processing", progress: 0.02, message: "Preparando OCR local" }));
    const updateProgress = (message: string, progress: number) => setSlot(side, (current) => ({ ...current, message, progress }));
    try {
      const extraction = await extractPdfWithOcr(file, updateProgress);
      const document = parseDocument({ fileName: file.name, fileSize: file.size, extraction });
      setSlot(side, { file, document, status: "ready", progress: 1, message: "OCR terminado" });
    } catch (error) {
      setSlot(side, { file, status: "error", progress: 0, error: error instanceof Error ? error.message : "El OCR local no pudo completarse." });
    }
  };
  const updateDocument = (side: Side, document: ParsedDocument) => setSlot(side, (current) => ({ ...current, document }));
  const exportSession = () => {
    if (!left && !right) return;
    download(`confronte-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ format: "confronte-ejf", version: 3, savedAt: new Date().toISOString(), documents: { constancia: left, liquidacion: right } }, null, 2), "application/json");
  };
  const importSession = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.format !== "confronte-ejf" || ![2, 3].includes(parsed?.version)) throw new Error("Formato incompatible");
      const constancia = parsed.documents?.constancia ? sanitizeImportedDocument(parsed.documents.constancia) : undefined;
      const liquidacion = parsed.documents?.liquidacion ? sanitizeImportedDocument(parsed.documents.liquidacion) : undefined;
      setSlots({ constancia: constancia ? { status: "ready", progress: 1, document: constancia } : EMPTY_SLOT, liquidacion: liquidacion ? { status: "ready", progress: 1, document: liquidacion } : EMPTY_SLOT });
    } catch {
      window.alert("La sesión no pertenece a Confronte EJF o está dañada.");
    }
  };
  const exportCsv = () => {
    if (!pairing || !calculation) return;
    const calculations = new Map(calculation.rows.map((row) => [row.key, row]));
    const header = ["clave", "capital_constancia", "capital_liquidacion", "resarcitorio_calculado", "resarcitorio_informado", "punitorio_calculado", "punitorio_informado", "total_calculado", "total_informado", "diferencia_total", "estado"];
    const lines = pairing.rowMatches.map((match) => {
      const row = calculations.get(match.key);
      return [match.key, match.constancia?.capital, match.liquidacion?.capital, row?.expectedResarcitorio, row?.actualResarcitorio, row?.expectedPunitorio, row?.actualPunitorio, row?.expectedTotal, row?.actualTotal, row?.totalDifference, match.status].map(escapeCsv).join(";");
    });
    download(`confronte-${new Date().toISOString().slice(0, 10)}.csv`, [header.join(";"), ...lines].join("\n"), "text/csv;charset=utf-8");
  };

  const resultTitle = finalTrustworthy
    ? "Confronte consistente y revisado"
    : !pairing?.reliable
      ? "Se detectaron diferencias que requieren revisión"
      : !allReviewed
        ? "Consistente, pendiente de confirmación"
        : !calculationReady
          ? "Faltan datos para reconstruir el cálculo"
          : !calculationCovered
            ? "Coincidencia documental con cobertura de tasas incompleta"
            : "El recálculo excede la tolerancia operativa";

  return (
    <>
      <header className="topbar"><div className="shell topbar__inner"><a className="brand" href="#inicio" aria-label="Ir al inicio"><span className="brand__mark">J15</span><span><strong>Juzgado N.º 15 · Secretaría N.º 29</strong><small>Herramientas internas · EJF</small></span></a><div className="topbar__actions"><span className="version-badge">v2.2</span><button className="header-button" type="button" onClick={() => sessionInput.current?.click()}><Icon name="archive" /> Abrir sesión</button><button className="header-button" type="button" onClick={exportSession} disabled={!left && !right}><Icon name="download" /> Guardar</button></div></div></header>
      <main id="inicio">
        <section className="hero"><div className="shell hero__grid"><div className="hero__copy"><p className="eyebrow eyebrow--gold">Control documental y cálculo trazable</p><h1>Confronte de<br /><em>liquidaciones EJF</em></h1><p className="hero__lead">Compare constancias de deuda y liquidaciones mandatarias con lectura de PDF, OCR local, revisión asistida y detalle de cada tramo de interés.</p><div className="privacy-chip"><Icon name="shield" /><span><strong>Procesamiento local</strong>Sus PDFs no se suben ni se almacenan.</span></div></div><aside className="hero__audit" aria-label="Criterios de control"><p className="eyebrow">Qué controla</p><ol><li><span>01</span><div><strong>Identidad documental</strong><small>Adjudicación o certificado.</small></div></li><li><span>02</span><div><strong>Integridad de la deuda</strong><small>Posiciones, vencimientos y capital con centavos.</small></div></li><li><span>03</span><div><strong>Intereses explicables</strong><small>Estándar, capitalización y deuda única.</small></div></li></ol></aside></div></section>
        <section className="workspace shell" aria-labelledby="workflow-title"><div className="section-heading"><div><p className="eyebrow">Flujo de trabajo</p><h2 id="workflow-title">Un confronte en tres etapas</h2></div><div className="stepper" aria-label="Progreso"><span className="is-active"><b>1</b>Cargar</span><i /><span className={left || right ? "is-active" : ""}><b>2</b>Revisar</span><i /><span className={bothReady ? "is-active" : ""}><b>3</b>Confrontar</span></div></div><div className="upload-grid"><UploadCard side="constancia" state={slots.constancia} onFile={(file) => processFile("constancia", file)} onRemove={() => setSlot("constancia", EMPTY_SLOT)} onOcr={() => rerunOcr("constancia")} /><div className="upload-connector"><Icon name="arrow" /></div><UploadCard side="liquidacion" state={slots.liquidacion} onFile={(file) => processFile("liquidacion", file)} onRemove={() => setSlot("liquidacion", EMPTY_SLOT)} onOcr={() => rerunOcr("liquidacion")} /></div>{!left && !right && <div className="empty-guidance"><Icon name="spark" /><div><strong>Perfiles documentales contemplados</strong><span>AGIP actual e histórica, capitalización por comprobantes o posiciones y deuda única con cálculo combinado.</span></div></div>}</section>
        {(left || right) && <section className="review-section"><div className="shell"><div className="section-heading section-heading--compact"><div><p className="eyebrow">Etapa 2</p><h2>Revise lo que leyó la aplicación</h2><p>La grilla es editable. Los importes se conservan con dos decimales y formato argentino.</p></div></div><div className="review-stack">{left && <DocumentReview title="Documento A" document={left} counterpart={right} onChange={(document) => updateDocument("constancia", document)} />}{right && <DocumentReview title="Documento B" document={right} counterpart={left} onChange={(document) => updateDocument("liquidacion", document)} />}</div></div></section>}
        {pairing && ordered && calculation && <section className="results-section" id="resultado"><div className="shell">
          <div className="scenario-ribbon"><Icon name="spark" /><span><strong>{SCENARIO_LABELS[calculation.scenario]}</strong>El método se eligió a partir de ambos documentos.</span></div>
          <div className="result-banner"><div className={`result-seal result-seal--${finalTrustworthy ? "ok" : pairing.reliable ? "review" : "critical"}`}><Icon name={finalTrustworthy ? "check" : "warning"} /></div><div><p className="eyebrow">Etapa 3 · resultado</p><h2>{resultTitle}</h2><p>{finalTrustworthy ? "Los renglones coinciden y el cálculo queda dentro de la tolerancia explícita." : "Abra los resúmenes inferiores para localizar exactamente la fecha, el tramo o el componente que produce la diferencia."}</p></div><div className="score"><strong>{pairing.score}</strong><span>índice documental</span></div></div>
          <div className="kpi-grid"><article><span>Capital de constancia</span><strong>{formatMoney(calculation.totalCapital)}</strong><small>{ordered.constancia.rows.length} renglones extraídos</small></article><article><span>Total liquidado</span><strong>{formatMoney(calculation.actualTotal)}</strong><small>Informado al {formatDate(ordered.liquidacion.metadata.liquidationDate ?? ordered.liquidacion.special?.punitorioTo)}</small></article><article className={!calculationWithinTolerance ? "kpi--alert" : ""}><span>Diferencia de recálculo</span><strong>{totalDifference === undefined ? "No cerrable" : formatMoney(totalDifference)}</strong><small>{calculationReady ? calculationCovered ? `Tolerancia 5%: ${formatMoney(calculationTolerance)}` : "Fuera de cobertura normativa" : "Faltan fechas o capital"}</small></article></div>
          <div className="result-grid"><article className="result-card"><div className="result-card__heading"><div><p className="eyebrow">Identidad e integridad</p><h3>Controles cruzados</h3></div><span>{pairing.checks.filter((check) => check.status === "ok").length}/{pairing.checks.length}</span></div><div className="check-list">{pairing.checks.map((check) => <div className={`check-row check-row--${check.status}`} key={check.id}><span className="check-row__icon"><Icon name={check.status === "ok" ? "check" : check.status === "critical" ? "warning" : "info"} /></span><div><strong>{check.label}</strong><small>{check.detail}</small>{(check.left || check.right) && <code>{check.left ?? "—"} ↔ {check.right ?? "—"}</code>}</div></div>)}</div></article><article className="result-card"><div className="result-card__heading"><div><p className="eyebrow">Renglones</p><h3>Coincidencia nominal</h3></div><span>{pairing.rowMatches.filter((row) => row.status === "ok").length}/{pairing.rowMatches.length}</span></div><div className="position-summary"><div><strong>{pairing.rowMatches.filter((row) => row.status === "ok").length}</strong><span>Coinciden</span></div><div><strong>{pairing.rowMatches.filter((row) => row.status === "missing").length}</strong><span>Faltantes</span></div><div><strong>{pairing.rowMatches.filter((row) => row.status === "critical").length}</strong><span>Diferencias</span></div></div><div className="mini-table">{pairing.rowMatches.slice(0, 8).map((row) => <div key={row.key}><code>{row.key}</code><span>{formatMoney(row.constancia?.capital ?? row.liquidacion?.capital)}</span><Icon name={row.status === "ok" ? "check" : "warning"} /></div>)}{pairing.rowMatches.length > 8 && <p>+ {pairing.rowMatches.length - 8} renglones en el detalle desplegable</p>}</div></article></div>
          <GeneralReport calculation={calculation} constancia={ordered.constancia} liquidacion={ordered.liquidacion} />
          {calculation.rows.length > 0 && <PositionDetails rows={calculation.rows} />}
          <div className="export-bar"><div><strong>Conserve evidencia del control</strong><span>La sesión guarda datos extraídos y correcciones, nunca los PDFs.</span></div><div><button type="button" className="button button--secondary" onClick={exportCsv}><Icon name="download" /> Exportar CSV</button><button type="button" className="button button--secondary" onClick={() => window.print()}><Icon name="print" /> Imprimir informe</button><button type="button" className="button button--primary" onClick={exportSession}><Icon name="archive" /> Guardar sesión</button></div></div>
        </div></section>}
      </main>
      <footer className="footer"><div className="shell footer__inner"><div><strong>Confronte de Liquidaciones EJF</strong><span>Herramienta de asistencia. No sustituye el control jurídico ni constituye un sistema oficial del Consejo de la Magistratura de la CABA.</span></div><p>Diseño y desarrollo: <strong>Marcelo Gómez</strong> · innovación aplicada a la gestión judicial.</p></div></footer>
      <input ref={sessionInput} className="sr-only" type="file" accept="application/json,.json" onChange={(event) => importSession(event.target.files?.[0])} />
    </>
  );
}
