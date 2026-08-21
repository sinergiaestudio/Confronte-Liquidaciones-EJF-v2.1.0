import type { RatePeriod } from "../domain/types";

const SOURCE_2022 = "Res. 4323/MHFGC/2022 y 360/AGIP/2022";
const SOURCE_PREVIOUS = "Res. 202/MHGC/2014";

export const INTEREST_RATES: RatePeriod[] = [
  { from: "2010-01-01", to: "2014-04-30", monthlyRate: 0.02, kind: "resarcitorio", sourceLabel: SOURCE_PREVIOUS },
  { from: "2014-05-01", to: "2022-12-31", monthlyRate: 0.03, kind: "resarcitorio", sourceLabel: SOURCE_PREVIOUS },
  { from: "2023-01-01", to: "2023-06-30", monthlyRate: 0.0562044198895028, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2023-07-01", to: "2023-12-31", monthlyRate: 0.0582900229343882, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2024-01-01", to: "2024-06-30", monthlyRate: 0.0882032967032967, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2024-07-01", to: "2024-12-31", monthlyRate: 0.0577010869565217, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2025-01-01", to: "2025-06-30", monthlyRate: 0.0357933334669703, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2025-07-01", to: "2025-12-31", monthlyRate: 0.0277799008136714, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2026-01-01", to: "2026-06-30", monthlyRate: 0.03686667, kind: "resarcitorio", sourceLabel: SOURCE_2022 },
  { from: "2026-07-01", to: "2026-12-31", monthlyRate: 0.02577333, kind: "resarcitorio", sourceLabel: SOURCE_2022 },

  { from: "2010-01-01", to: "2014-04-30", monthlyRate: 0.03, kind: "punitorio", sourceLabel: SOURCE_PREVIOUS },
  { from: "2014-05-01", to: "2022-12-31", monthlyRate: 0.0400003157562362, kind: "punitorio", sourceLabel: SOURCE_PREVIOUS },
  { from: "2023-01-01", to: "2023-06-30", monthlyRate: 0.0842983425414365, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2023-07-01", to: "2023-12-31", monthlyRate: 0.0874402173913043, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2024-01-01", to: "2024-06-30", monthlyRate: 0.1321978021978022, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2024-07-01", to: "2024-12-31", monthlyRate: 0.0865923913043478, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2025-01-01", to: "2025-06-30", monthlyRate: 0.0536850828729282, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2025-07-01", to: "2025-12-31", monthlyRate: 0.0416700425275573, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2026-01-01", to: "2026-06-30", monthlyRate: 0.0553, kind: "punitorio", sourceLabel: SOURCE_2022 },
  { from: "2026-07-01", to: "2026-12-31", monthlyRate: 0.03866, kind: "punitorio", sourceLabel: SOURCE_2022 },
];

export const RATE_COVERAGE = { from: "2010-01-01", to: "2026-12-31" } as const;

