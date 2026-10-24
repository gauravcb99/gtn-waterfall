import drugsJson from "../../data/drug-line-review/drugs.json";
import cmsJson from "../../data/drug-line-review/cms-asp-oct-2026.json";
import sourcesJson from "../../data/drug-line-review/sources.json";
import type { Citation, Drug } from "./types";

export const drugs = drugsJson.drugs as unknown as Drug[];
export const cms = cmsJson;

export function findDrug(id: string): Drug | undefined {
  return drugs.find((d) => d.id === id);
}

export function paymentLimit(hcpcs: string): number {
  const row = cms.codes.find((c) => c.hcpcs === hcpcs);
  if (!row) throw new Error(`HCPCS ${hcpcs} not in CMS data`);
  return row.paymentLimit;
}

const faq = sourcesJson.sources.find((s) => s.id === "cms-jw-jz-faq");
if (!faq?.quotes) throw new Error("cms-jw-jz-faq quotes missing from sources.json");

// The FAQ quotes in sources.json as citations: [JW applies, JZ applies].
export const jwJzCitations: Citation[] = [faq.quotes.jwApplies, faq.quotes.jzApplies].map((q) => ({
  source: faq.id,
  file: faq.url,
  section: q.section,
  quote: q.quote,
}));

// Rounds to 4 decimals to remove floating-point noise (0.9 x 70 must equal 63).
export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

// "Units" and "UNIT" are the same measure; so are "mg" and "MG".
export function measure(unit: string): string {
  return unit.toUpperCase().replace(/S$/, "");
}
