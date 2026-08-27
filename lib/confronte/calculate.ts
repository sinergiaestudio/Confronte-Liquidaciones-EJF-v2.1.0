import { addDays, daysInclusive, roundMoney } from "../domain/normalize";
import type {
  ConfronteCalculation,
  ConfronteScenario,
  DebtRow,
  InterestCalculation,
  InterestTranche,
  ParsedDocument,
  RecalculatedRow,
} from "../domain/types";
import { INTEREST_RATES } from "./rates";

function later(left: string, right: string): string {
  return left > right ? left : right;
}

function earlier(left: string, right: string): string {
  return left < right ? left : right;
}

function sumMoney(values: Array<number | undefined>): number {
  return roundMoney(values.reduce<number>((sum, value) => sum + (value ?? 0), 0));
}

function sumOptional(values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length ? sumMoney(present) : undefined;
}

export function calculateInterest(
  capital: number,
  from: string,
  to: string,
  kind: "resarcitorio" | "punitorio",
): InterestCalculation {
  if (!from || !to || from > to || capital < 0) {
    return { capital, from, to, kind, interest: 0, tranches: [], covered: false, uncoveredDates: [from, to].filter(Boolean) };
  }

  const tranches: InterestTranche[] = INTEREST_RATES
    .filter((period) => period.kind === kind && period.from <= to && period.to >= from)
    .map((period) => {
      const trancheFrom = later(from, period.from);
      const trancheTo = earlier(to, period.to);
      const days = daysInclusive(trancheFrom, trancheTo);
      return {
        from: trancheFrom,
        to: trancheTo,
        days,
        monthlyRate: period.monthlyRate,
        interest: roundMoney(capital * period.monthlyRate * (days / 30)),
        sourceLabel: period.sourceLabel,
      };
    })
    .filter((tranche) => tranche.days > 0);

  const coveredDays = tranches.reduce((sum, tranche) => sum + tranche.days, 0);
  const expectedDays = daysInclusive(from, to);
  const uncoveredDates = coveredDays === expectedDays ? [] : [from, to];
  return {
    capital,
    from,
    to,
    kind,
    interest: sumMoney(tranches.map((tranche) => tranche.interest)),
    tranches,
    covered: uncoveredDates.length === 0,
    uncoveredDates,
  };
}

export function resolveConfronteScenario(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
): ConfronteScenario {
  const profiles = [liquidacion.profile, constancia.profile];
  if (profiles.includes("deuda_unica")) return "deuda_unica";
  if (profiles.includes("capitalizacion_facturas")) return "capitalizacion_facturas";
  if (profiles.includes("capitalizacion_posiciones")) return "capitalizacion_posiciones";
  return "estandar";
}

function rowsByUnion(constancia: ParsedDocument, liquidacion: ParsedDocument): Array<{
  source: DebtRow;
  actual?: DebtRow;
  constancia?: DebtRow;
}> {
  const left = new Map(constancia.rows.map((row) => [row.key, row]));
  const right = new Map(liquidacion.rows.map((row) => [row.key, row]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();
  return keys.map((key) => ({
    source: left.get(key) ?? right.get(key)!,
    actual: right.get(key),
    constancia: left.get(key),
  }));
}

function rowsForCapitalization(constancia: ParsedDocument, liquidacion: ParsedDocument): Array<{
  source: DebtRow;
  actual?: DebtRow;
  constancia?: DebtRow;
}> {
  const left = new Map(constancia.rows.map((row) => [row.key, row]));
  if (liquidacion.rows.length) {
    return liquidacion.rows.map((actual) => {
      const sourceConstancia = left.get(actual.key);
      return {
        // La liquidación especial contiene la base y la mora de su propia
        // capitalización. La constancia se usa para el control documental,
        // pero una lectura parcial de ella no debe alterar ni duplicar el
        // desarrollo matemático que se está auditando.
        source: actual,
        actual,
        constancia: sourceConstancia,
      };
    });
  }
  return constancia.rows.map((source) => ({ source, constancia: source }));
}

function actualRowTotal(row?: DebtRow): number | undefined {
  if (!row) return undefined;
  if (row.total !== undefined) return row.total;
  if (row.resarcitorio === undefined || row.punitorio === undefined) return undefined;
  return sumMoney([row.capital, row.resarcitorio, row.punitorio]);
}

function calculateStandard(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
): ConfronteCalculation {
  const suitStart = liquidacion.metadata.suitStartDate;
  const liquidationDate = liquidacion.metadata.liquidationDate;
  const messages: string[] = [];
  if (!suitStart || !liquidationDate) messages.push("Faltan la fecha de inicio de juicio o la fecha de liquidación.");

  const rows: RecalculatedRow[] = !suitStart || !liquidationDate ? [] : rowsByUnion(constancia, liquidacion).flatMap(({ source, actual, constancia: sourceConstancia }) => {
    if (!source.dueDate) return [];
    const historicalCutoff = constancia.profile === "agip_historica"
      ? constancia.metadata.interestCutoffDate
      : undefined;
    const certifiedResarcitorio = historicalCutoff && sourceConstancia?.total !== undefined
      ? roundMoney(Math.max(0, sourceConstancia.total - sourceConstancia.capital))
      : undefined;
    const resFrom = certifiedResarcitorio !== undefined && historicalCutoff
      ? addDays(historicalCutoff, 1)
      : addDays(source.dueDate, 1);
    const resTo = addDays(suitStart, -1);
    const res: InterestCalculation = resFrom <= resTo
      ? calculateInterest(source.capital, resFrom, resTo, "resarcitorio")
      : {
          capital: source.capital,
          from: resFrom,
          to: resTo,
          kind: "resarcitorio",
          interest: 0,
          tranches: [],
          covered: true,
          uncoveredDates: [],
        };
    const pun = calculateInterest(source.capital, suitStart, addDays(liquidationDate, -1), "punitorio");
    const expectedResarcitorio = sumMoney([certifiedResarcitorio, res.interest]);
    const expectedTotal = sumMoney([source.capital, expectedResarcitorio, pun.interest]);
    const actualTotal = actualRowTotal(actual);
    const notes: string[] = [];
    if (!sourceConstancia) notes.push("Renglón tomado de la liquidación porque no fue reconstruido en la constancia.");
    if (certifiedResarcitorio !== undefined && historicalCutoff) {
      notes.push(`El resarcitorio parte del interés certificado al ${historicalCutoff}; sólo se recalcula su continuación.`);
    } else if (constancia.profile === "agip_historica") {
      notes.push("No pudo reconstruirse el corte histórico; el resarcitorio se recalculó íntegramente desde el vencimiento.");
    }
    return [{
      key: source.key,
      capital: source.capital,
      actualCapital: actual?.capital,
      capitalDifference: actual?.capital === undefined ? undefined : roundMoney(actual.capital - source.capital),
      expectedResarcitorio,
      certifiedResarcitorio,
      actualResarcitorio: actual?.resarcitorio,
      resarcitorioDifference: actual?.resarcitorio === undefined ? undefined : roundMoney(actual.resarcitorio - expectedResarcitorio),
      expectedPunitorio: pun.interest,
      actualPunitorio: actual?.punitorio,
      punitorioDifference: actual?.punitorio === undefined ? undefined : roundMoney(actual.punitorio - pun.interest),
      expectedTotal,
      actualTotal,
      totalDifference: actualTotal === undefined ? undefined : roundMoney(actualTotal - expectedTotal),
      resarcitorioTranches: res.tranches,
      punitorioTranches: pun.tranches,
      covered: res.covered && pun.covered,
      notes,
    }];
  });

  const totalCapital = sumMoney(rows.map((row) => row.capital));
  const expectedResarcitorio = sumMoney(rows.map((row) => row.expectedResarcitorio));
  const expectedPunitorio = sumMoney(rows.map((row) => row.expectedPunitorio));
  const expectedTotal = sumMoney([totalCapital, expectedResarcitorio, expectedPunitorio]);
  return {
    scenario: "estandar",
    rows,
    covered: rows.length > 0 && rows.every((row) => row.covered),
    totalCapital,
    expectedResarcitorio,
    actualResarcitorio: sumOptional(rows.map((row) => row.actualResarcitorio)),
    expectedPunitorio,
    actualPunitorio: sumOptional(rows.map((row) => row.actualPunitorio)),
    expectedTotal,
    actualTotal: liquidacion.metadata.declaredTotal ?? sumOptional(rows.map((row) => row.actualTotal)),
    postCapitalizationTranches: [],
    messages,
  };
}

function calculateCapitalization(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
  scenario: "capitalizacion_facturas" | "capitalizacion_posiciones",
): ConfronteCalculation {
  const suitStart = liquidacion.metadata.suitStartDate;
  const notificationDate = liquidacion.metadata.notificationDate;
  const liquidationDate = liquidacion.metadata.liquidationDate;
  const messages: string[] = [];
  if (!suitStart || !notificationDate || !liquidationDate) {
    messages.push("La capitalización requiere inicio de juicio, notificación de demanda y fecha de liquidación.");
  }

  const rows: RecalculatedRow[] = !suitStart || !notificationDate || !liquidationDate
    ? []
    : rowsForCapitalization(constancia, liquidacion).flatMap(({ source, actual, constancia: sourceConstancia }) => {
        if (!source.dueDate) return [];
        const res = calculateInterest(source.capital, addDays(source.dueDate, 1), suitStart, "resarcitorio");
        const pun = calculateInterest(source.capital, addDays(suitStart, 1), notificationDate, "punitorio");
        const expectedTotal = sumMoney([source.capital, res.interest, pun.interest]);
        const actualTotal = actualRowTotal(actual);
        const notes: string[] = [];
        if (!sourceConstancia) notes.push("Renglón calculado desde la liquidación especial porque no pudo emparejarse con la constancia.");
        if (scenario === "capitalizacion_facturas" && actual?.punitorio === undefined) {
          notes.push("El punitorio previo está informado de manera global en la liquidación especial.");
        }
        return [{
          key: source.key,
          capital: source.capital,
          actualCapital: actual?.capital,
          capitalDifference: actual?.capital === undefined ? undefined : roundMoney(actual.capital - source.capital),
          expectedResarcitorio: res.interest,
          actualResarcitorio: actual?.resarcitorio,
          resarcitorioDifference: actual?.resarcitorio === undefined ? undefined : roundMoney(actual.resarcitorio - res.interest),
          expectedPunitorio: pun.interest,
          actualPunitorio: actual?.punitorio,
          punitorioDifference: actual?.punitorio === undefined ? undefined : roundMoney(actual.punitorio - pun.interest),
          expectedTotal,
          actualTotal,
          totalDifference: actualTotal === undefined ? undefined : roundMoney(actualTotal - expectedTotal),
          resarcitorioTranches: res.tranches,
          punitorioTranches: pun.tranches,
          covered: res.covered && pun.covered,
          notes,
        }];
      });

  const totalCapital = sumMoney(rows.map((row) => row.capital));
  const expectedResarcitorio = sumMoney(rows.map((row) => row.expectedResarcitorio));
  const expectedPunitorio = sumMoney(rows.map((row) => row.expectedPunitorio));
  const expectedCapitalized = sumMoney([totalCapital, expectedResarcitorio, expectedPunitorio]);
  const post = notificationDate && liquidationDate
    ? calculateInterest(expectedCapitalized, addDays(notificationDate, 1), liquidationDate, "punitorio")
    : { interest: 0, tranches: [] as InterestTranche[], covered: false };
  const expectedTotal = sumMoney([expectedCapitalized, post.interest]);
  const actualPunitorioFromRows = sumOptional(rows.map((row) => row.actualPunitorio));
  const actualCapitalizedFromRows = sumOptional(rows.map((row) => row.actualTotal));

  return {
    scenario,
    rows,
    covered: rows.length > 0 && rows.every((row) => row.covered) && post.covered,
    totalCapital,
    expectedResarcitorio,
    actualResarcitorio: sumOptional(rows.map((row) => row.actualResarcitorio)),
    expectedPunitorio,
    actualPunitorio: liquidacion.special?.priorPunitorioDeclared ?? actualPunitorioFromRows,
    expectedCapitalized,
    actualCapitalized: liquidacion.special?.capitalizedDeclared ?? actualCapitalizedFromRows,
    expectedPostCapitalizationPunitorio: post.interest,
    actualPostCapitalizationPunitorio: liquidacion.special?.postCapitalizationPunitorioDeclared,
    expectedTotal,
    actualTotal: liquidacion.special?.finalTotalDeclared ?? liquidacion.metadata.declaredTotal,
    postCapitalizationTranches: post.tranches,
    messages,
  };
}

function calculateUniqueDebt(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
): ConfronteCalculation {
  const source = constancia.rows[0] ?? liquidacion.rows[0];
  const actual = liquidacion.rows[0];
  const ranges = liquidacion.special;
  const messages: string[] = [];
  if (!source || !ranges?.resarcitorioFrom || !ranges.resarcitorioTo || !ranges.punitorioFrom || !ranges.punitorioTo) {
    messages.push("No pudieron reconstruirse íntegramente el capital y los dos períodos de la deuda única.");
  }

  const canCalculate = Boolean(
    source && ranges?.resarcitorioFrom && ranges.resarcitorioTo && ranges.punitorioFrom && ranges.punitorioTo,
  );
  const rows: RecalculatedRow[] = !canCalculate || !source || !ranges ? [] : (() => {
    const res = calculateInterest(source.capital, addDays(ranges.resarcitorioFrom!, 1), ranges.resarcitorioTo!, "resarcitorio");
    const pun = calculateInterest(source.capital, addDays(ranges.punitorioFrom!, 1), ranges.punitorioTo!, "punitorio");
    const expectedTotal = sumMoney([source.capital, res.interest, pun.interest]);
    const actualTotal = actualRowTotal(actual) ?? liquidacion.metadata.declaredTotal;
    return [{
      key: source.key,
      capital: source.capital,
      actualCapital: actual?.capital,
      capitalDifference: actual?.capital === undefined ? undefined : roundMoney(actual.capital - source.capital),
      expectedResarcitorio: res.interest,
      actualResarcitorio: actual?.resarcitorio,
      resarcitorioDifference: actual?.resarcitorio === undefined ? undefined : roundMoney(actual.resarcitorio - res.interest),
      expectedPunitorio: pun.interest,
      actualPunitorio: actual?.punitorio,
      punitorioDifference: actual?.punitorio === undefined ? undefined : roundMoney(actual.punitorio - pun.interest),
      expectedTotal,
      actualTotal,
      totalDifference: actualTotal === undefined ? undefined : roundMoney(actualTotal - expectedTotal),
      resarcitorioTranches: res.tranches,
      punitorioTranches: pun.tranches,
      covered: res.covered && pun.covered,
      notes: [],
    }];
  })();

  const row = rows[0];
  return {
    scenario: "deuda_unica",
    rows,
    covered: Boolean(row?.covered),
    totalCapital: row?.capital ?? source?.capital ?? 0,
    expectedResarcitorio: row?.expectedResarcitorio ?? 0,
    actualResarcitorio: row?.actualResarcitorio,
    expectedPunitorio: row?.expectedPunitorio ?? 0,
    actualPunitorio: row?.actualPunitorio,
    expectedTotal: row?.expectedTotal ?? 0,
    actualTotal: liquidacion.metadata.declaredTotal ?? row?.actualTotal,
    postCapitalizationTranches: [],
    messages,
  };
}

export function recalculatePair(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
): ConfronteCalculation {
  const scenario = resolveConfronteScenario(constancia, liquidacion);
  if (scenario === "deuda_unica") return calculateUniqueDebt(constancia, liquidacion);
  if (scenario === "capitalizacion_facturas" || scenario === "capitalizacion_posiciones") {
    return calculateCapitalization(constancia, liquidacion, scenario);
  }
  return calculateStandard(constancia, liquidacion);
}

export function recalculateStandardRows(
  constancia: ParsedDocument,
  liquidacion: ParsedDocument,
): RecalculatedRow[] {
  return calculateStandard(constancia, liquidacion).rows;
}
