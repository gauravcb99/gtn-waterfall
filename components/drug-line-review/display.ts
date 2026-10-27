import { usd } from "@/lib/drug-line-review/wording";
import type { CheckResult, ClaimLine } from "@/lib/drug-line-review/types";

// Presentation only. Messages, formulas and summary phrases come from lib/ as-is; this file
// labels and formats the structured values, hides rows that don't apply, and builds the summary.

export type Ctx = { line: ClaimLine; results: CheckResult[] };
export type Display = { message: string; formula?: string; rows: [string, string][] };

export const TITLES: Record<CheckResult["id"], string> = {
  dose: "Dose",
  dose_advisory: "Label maximum",
  vials: "Vials and waste",
  vial_advisory: "Vial choice",
  units: "Units billed",
  jw_jz: "JW / JZ modifiers",
  benchmark: "Benchmark vs CMS payment limit",
  dollars: "Dollars at stake",
};

const VALUE_LABELS: Record<string, string> = {
  doseAmount: "Dose (billing measure)",
  doseUnits: "Dose in billing units",
  capped: "Capped at label maximum",
  vials: "Vials",
  basis: "Vial basis",
  drawn: "Drawn",
  waste: "Waste",
  wasteUnits: "Waste (billing units)",
  maxValidUnits: "Max valid units",
  leastWasteVials: "Least-waste vials",
  leastWaste: "Least possible waste",
  totalBilled: "Total billed units",
  excess: "Excess units",
  expected: "Expected modifier",
  administeredUnits: "Administered units",
  jwUnitsBilled: "JW units billed",
  jzReported: "JZ reported",
  paymentLimit: "CMS payment limit (per unit)",
  billedPerUnit: "Billed per unit",
  markup: "Markup",
  benchmarkTotal: "Benchmark total",
  quarter: "Quarter",
  amount: "Amount",
  amountAtBilledRate: "At billed rate",
  amountAtPaymentLimit: "At CMS payment limit",
};

const MONEY_KEYS = ["billedPerUnit", "benchmarkTotal", "amount", "amountAtBilledRate", "amountAtPaymentLimit"];
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function formatValue(key: string, v: number | string | boolean | number[]): string {
  if (Array.isArray(v)) return v.join(" + ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (key === "markup") return `${v.toFixed(2)}x`;
  if (key === "paymentLimit") return `$${v}`; // full CMS precision
  if (MONEY_KEYS.includes(key)) return usd(v);
  return String(v);
}

export function describe(r: CheckResult, ctx: Ctx): Display {
  const weightOrBsa = ctx.line.dose.unit === "mg/kg" || ctx.line.dose.unit === "mg/m2";
  const rows = Object.entries(r.values)
    .filter(([k]) => k !== "capped" || weightOrBsa)
    // Negative waste means the documented vials do not cover the dose; there is no waste to show.
    .filter(([k, v]) => !((k === "waste" || k === "wasteUnits") && (v as number) < 0))
    .map(([k, v]) => [VALUE_LABELS[k] ?? k, formatValue(k, v)] as [string, string]);
  return { message: r.message, formula: r.formula, rows };
}

// The dollar note appended to the excess-units phrase, from the dollars result's values.
function dollarsNote(ctx: Ctx): string {
  const d = ctx.results.find((r) => r.id === "dollars");
  if (d?.status !== "info") return " (dollars at stake need info)";
  if (ctx.line.contractType === "inpatient_drg") return " ($0 at stake: drugs are bundled into the DRG case rate)";
  if (d.values.amount !== undefined) return ` (${usd(d.values.amount as number)} at stake, illustrative)`;
  return (
    ` (${usd(d.values.amountAtBilledRate as number)} at the billed rate or ` +
    `${usd(d.values.amountAtPaymentLimit as number)} at the CMS payment limit, illustrative)`
  );
}

// One-line verdict, e.g. "2 flags: 100 excess units ($651.40 at stake, illustrative); JZ expected but not reported."
export function summarize(ctx: Ctx): string {
  const by = (s: CheckResult["status"]) => ctx.results.filter((r) => r.status === s);
  const phrase = (r: CheckResult) => (r.summary ?? TITLES[r.id]) + (r.id === "units" ? dollarsNote(ctx) : "");
  const flags = by("flag");
  const advisories = by("advisory");
  const needs = by("needs_info");
  const parts = [
    flags.length ? `${flags.length} ${plural(flags.length, "flag", "flags")}: ${flags.map(phrase).join("; ")}.` : "No flags.",
  ];
  if (advisories.length)
    parts.push(`${advisories.length} ${plural(advisories.length, "advisory", "advisories")}: ${advisories.map(phrase).join("; ")}.`);
  if (needs.length) parts.push(`${needs.length} needs info: ${needs.map((r) => TITLES[r.id]).join(", ")}.`);
  return parts.join(" ");
}
