"use client";
import { useMemo } from "react";
import { invoiceAudit } from "../../lib/confronte/invoice-audit";
import { formatMoney } from "../../lib/domain/normalize";
import type { ConfronteCalculation, ParsedDocument } from "../../lib/domain/types";
export function SpecialReview({ cert, sheet, calc }: { cert: ParsedDocument; sheet: ParsedDocument; calc: ConfronteCalculation }) {
  const audit = useMemo(() => invoiceAudit(cert, sheet, calc), [cert, sheet, calc]);
  return <section className="result-card special-review">
    <p className="eyebrow">Ejecución especial · comprobantes</p>
    <h3>{audit.missing.length ? "Datos insuficientes para cerrar el confronte" : audit.differences.length ? "Diferencias en la liquidación" : "Cálculo reproducido · revisión pendiente"}</h3>
    <p>Capital original {formatMoney(audit.original)}. Total presentado {formatMoney(calc.actualTotal)}. Total según el método de la planilla {formatMoney(audit.total)}.</p>
    <details><summary>Ver cálculo, tasas y diferencias</summary>
      <p>Se compara el interés de cada factura desde la mora. El subtotal conserva la precisión anterior al redondeo de cada fila. Para el punitorio previo se aplica sobre el capital original el porcentaje acumulado de cada tramo con tres decimales. Para el posterior se calcula sobre el capital capitalizado hasta el corte.</p>
      <p>Recálculo con la precisión de la tabla de tasas {formatMoney(calc.expectedTotal)}. Diferencia con lo presentado {formatMoney(calc.actualTotal === undefined ? undefined : calc.actualTotal - calc.expectedTotal)}.</p>
      <div className="special-scroll"><table><thead><tr><th>Control</th><th>Presentado</th><th>Recalculado</th><th>Diferencia</th></tr></thead><tbody>{audit.checks.map((c,i)=><tr key={i}><td>{c.label}</td>{[c.presented,c.expected,c.difference].map((n,j)=><td key={j}>{n === undefined ? "Sin dato" : /días|%/i.test(c.label) ? n.toLocaleString("es-AR",{maximumFractionDigits:3}) : formatMoney(n)}</td>)}</tr>)}</tbody></table></div>
      <p>Fuentes de consulta · <a href="https://imagenes.agip.gob.ar/impuestos/sellos" target="_blank" rel="noreferrer">Tasas AGIP</a> · <a href="https://boletinoficialpdf.buenosaires.gob.ar/util/imagen.php?idf=1&idn=365773" target="_blank" rel="noreferrer">Régimen de recupero de prestaciones de salud, anexo I, VIII</a> · <a href="https://www.argentina.gob.ar/normativa/nacional/ley-26994-235975/actualizacion" target="_blank" rel="noreferrer">CCyCN, art. 770</a></p>
    </details>
    {!!audit.missing.length && <p>Falta verificar · {audit.missing.join(" · ")}</p>}
    {!!audit.differences.length && <p>Diferencias · {audit.differences.join(" · ")}</p>}
    <p>El control del expediente y el proyecto de aprobación con nota al pie están disponibles en la <a href="https://confronte-liquidaciones-ejf.arielmarcelogomez7.chatgpt.site">aplicación principal de la Secretaría</a>.</p>
  </section>;
}

export function DocumentSources({ doc }: { doc: ParsedDocument }) {
  return <details className="document-sources"><summary>Ubicar los datos en el documento</summary>{doc.extraction.pages.map(p=>{
    const table = doc.rows.some(r=>r.sourcePage===p.pageNumber);
    const label = table ? "Tabla de comprobantes" : /^TOTAL\s*\$/im.test(p.text) ? "Cierre de la planilla" : /firmado|hoja adicional de firmas/i.test(p.text) ? "Escrito o firma" : p.characterCount<40 ? "Hoja residual" : "Texto del documento";
    return <details key={p.pageNumber}><summary>Pág. {p.pageNumber} · {label}{p.width && p.height ? p.width>p.height ? " · apaisada" : " · vertical" : ""}</summary><pre>{p.lines?.map(l=>"["+l.x+", "+l.y+"] "+l.text).join("\n") || p.text || "Página sin texto."}</pre></details>;
  })}</details>;
}

const amounts = { resarcitorioDeclared: "Subtotal de resarcitorios", priorPunitorioDeclared: "Subtotal de punitorios previos",
  capitalizedDeclared: "Capital capitalizado", postCapitalizationPunitorioDeclared: "Punitorios posteriores", finalTotalDeclared: "Total liquidado" } as const;
export function SheetFields({ doc, change }: { doc: ParsedDocument; change: (d: ParsedDocument)=>void }) {
  if (doc.profile !== "capitalizacion_facturas") return null;
  const cert = doc.kind === "constancia";
  const patch = (d: Partial<ParsedDocument>) => change({...doc,...d,reviewed:false});
  const money = (label:string, value:number|undefined, update:(n:number|undefined)=>void) =>
    <label key={label}><span>{label}</span><input aria-label={label} inputMode="decimal" defaultValue={value?.toLocaleString("es-AR",{useGrouping:false,maximumFractionDigits:6}) ?? ""} key={String(value)} onBlur={e=>{
      const raw=e.target.value.trim();
      const n=raw.includes(",") ? Number(raw.replace(/\./g,"").replace(",",".")) : Number(raw);
      if (!raw && value !== undefined) update(undefined);
      else if (raw && Number.isFinite(n) && n>=0) { if (value !== n) update(n); }
      else e.target.value=value?.toString() ?? "";
    }}/></label>;
  return <details className="document-sources"><summary>Revisar importes y tramos de origen</summary>
    <div className="metadata-grid">{cert ? <>
      {money("Total certificado",doc.metadata.declaredTotal,n=>patch({metadata:{...doc.metadata,declaredTotal:n}}))}
      <label><span>Corte de intereses del título</span><input type="date" value={doc.metadata.interestCutoffDate ?? ""} onChange={e=>patch({metadata:{...doc.metadata,interestCutoffDate:e.target.value}})}/></label></> :
      Object.entries(amounts).map(([key,label])=>money(label,doc.special?.[key as keyof typeof amounts],n=>patch({special:{...doc.special,[key]:n},...(key==="finalTotalDeclared" ? {metadata:{...doc.metadata,declaredTotal:n}} : {})})))}</div>
    {doc.rows.map(row=>{
      const update = (field: string,value:string|number|undefined)=>patch({rows:doc.rows.map(r=>r.id===row.id ? {...r,[field]:value} : r)});
      return <details key={row.id}><summary>{row.originalDocumentId || row.key} · pág. {row.sourcePage ?? "sin identificar"}</summary><div className="metadata-grid">
        <label><span>Fecha de factura</span><input type="date" value={row.presentationDate ?? ""} onChange={e=>update("presentationDate",e.target.value)}/></label>
        {cert ? <>{money("Intereses certificados",row.resarcitorio,n=>update("resarcitorio",n))}{money("Total del comprobante",row.total,n=>update("total",n))}</> :
          <>{money("Días de mora",row.reportedDays,n=>update("reportedDays",n))}{money("Tasa acumulada (%)",row.reportedRate,n=>update("reportedRate",n))}</>}
      </div></details>;
    })}
    {!cert && <><div className="metadata-grid">{money("Días posteriores",doc.special?.postDays,n=>patch({special:{...doc.special,postDays:n}}))}
      {money("Tasa posterior (%)",doc.special?.postRate,n=>patch({special:{...doc.special,postRate:n}}))}</div>
      {(doc.special?.priorTranches ?? []).map((t,i)=>{
        const modify=(key:string,n:number|undefined)=>patch({special:{...doc.special,priorTranches:doc.special?.priorTranches?.map((item,j)=>j===i ? {...item,[key]:n} : item)}});
        return <fieldset key={i}><legend>Tramo previo {i+1}</legend><div className="metadata-grid">{money("Días",t.days,n=>modify("days",n))}{money("Tasa mensual (%)",t.rate,n=>modify("rate",n))}{money("Intereses",t.interest,n=>modify("interest",n))}</div>
          <button type="button" onClick={()=>patch({special:{...doc.special,priorTranches:doc.special?.priorTranches?.filter((_,j)=>i!==j)}})}>Quitar tramo</button></fieldset>;
      })}<button type="button" onClick={()=>patch({special:{...doc.special,priorTranches:[...(doc.special?.priorTranches ?? []),{days:0,rate:0}]}})}>Agregar tramo</button></>}
  </details>;
}
