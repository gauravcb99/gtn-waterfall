import { measure, paymentLimit, round4 } from "@/lib/drug-line-review/data";
import type { CheckResult, ClaimLine, Drug } from "@/lib/drug-line-review/types";

// Display layer only: plain-word messages, formulas and value rows built from the structured
// results. Every number shown comes from the results (or the CMS payment limit); none is re-derived.

export type Ctx = { drug: Drug; line: ClaimLine; results: CheckResult[] };
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
const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const units = (n: number) => `${n} ${plural(n, "unit", "units")}`; // billing units
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function vocab(ctx: Ctx) {
  const bu = ctx.drug.billingUnit.value;
  const isUnit = measure(bu.unit) === "UNIT";
  const qty = (n: number) => (isUnit ? `${n} ${plural(n, "unit", "units")}` : `${n} mg`);
  return {
    qty,
    buText: qty(bu.amount), // "1 unit", "10 mg"
    vialName: (s: number) => (isUnit ? `${s}-unit` : `${s} mg`),
    measureWord: isUnit ? "units" : "mg",
    limitText: `$${paymentLimit(ctx.drug.hcpcs.value)}`, // full CMS precision
  };
}

function formatValue(key: string, v: number | string | boolean | number[], limitText: string): string {
  if (Array.isArray(v)) return v.join(" + ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (key === "markup") return `${v.toFixed(2)}x`;
  if (key === "paymentLimit") return limitText;
  if (MONEY_KEYS.includes(key)) return usd(v);
  return String(v);
}

const get = (ctx: Ctx, id: CheckResult["id"]) => ctx.results.find((r) => r.id === id);
const n = (r: CheckResult | undefined, key: string) => r?.values[key] as number;

export function describe(r: CheckResult, ctx: Ctx): Display {
  const w = vocab(ctx);
  const { line } = ctx;
  const weightOrBsa = line.dose.unit === "mg/kg" || line.dose.unit === "mg/m2";
  const rows = Object.entries(r.values)
    .filter(([k]) => k !== "capped" || weightOrBsa)
    // Negative waste means the documented vials do not cover the dose; there is no waste to show.
    .filter(([k, v]) => !((k === "waste" || k === "wasteUnits") && (v as number) < 0))
    .map(([k, v]) => [VALUE_LABELS[k] ?? k, formatValue(k, v, w.limitText)] as [string, string]);
  const own = { message: r.message, formula: r.formula, rows };

  switch (r.id) {
    case "dose": {
      if (r.status !== "info") return own;
      const dose = n(r, "doseAmount");
      const units = n(r, "doseUnits");
      // The logic's formula is "<computation>; [capped ...;] / <unit> = <n> units": reuse its numbers.
      const parts = (r.formula ?? "").split("; ");
      const computed = parts[0].includes("=") ? parts[0].replace(/ x /g, " × ") : undefined;
      const cap = parts.find((p) => p.startsWith("capped at label maximum"));
      return {
        message: `Dose: ${w.qty(dose)} = ${units} billing ${plural(units, "unit", "units")} (${w.buText} each)${cap ? `, ${cap}` : ""}`,
        formula: [computed, cap, `${w.qty(dose)} ÷ ${w.buText} = ${units} billing ${plural(units, "unit", "units")}`]
          .filter(Boolean)
          .join("; "),
        rows,
      };
    }
    case "vials": {
      const vials = r.values.vials as number[];
      const drawn = n(r, "drawn");
      if (drawn === undefined) return own; // vial size not on the label: the logic's message says which
      const dose = n(get(ctx, "dose"), "doseAmount");
      const maxValid = n(r, "maxValidUnits");
      const validPart = `${w.qty(drawn)} ÷ ${w.buText} = ${maxValid} valid billing units`;
      if (r.status === "flag")
        return {
          message: `The documented ${vials.length > 1 ? `vials (${vials.join(" + ")} = ${w.qty(drawn)})` : `vial (${w.qty(drawn)})`} ${vials.length > 1 ? "do" : "does"} not cover the documented dose (${w.qty(dose)})`,
          formula: `${vials.join(" + ")} = ${w.qty(drawn)} drawn, less than the ${w.qty(dose)} dose; ${validPart}`,
          rows,
        };
      const waste = n(r, "waste");
      const count = vials.length;
      const assumed = r.values.basis !== "documented" ? ` (${r.values.basis})` : "";
      const drawnPart = count > 1 ? `${vials.join(" + ")} = ${w.qty(drawn)} drawn` : `${w.qty(drawn)} drawn (1 vial)`;
      return {
        message:
          `Drew ${w.qty(drawn)} from ${count} ${plural(count, "vial", "vials")}${count > 1 ? ` (${vials.join(" + ")})` : ""}, ` +
          `${waste === 0 ? "no waste" : `${w.qty(waste)} wasted (${n(r, "wasteUnits")} billing ${plural(n(r, "wasteUnits"), "unit", "units")})`}${assumed}`,
        formula: `${drawnPart}; ${w.qty(drawn)} − ${w.qty(dose)} = ${w.qty(waste)} waste; ${validPart}`,
        rows,
      };
    }
    case "vial_advisory": {
      const least = r.values.leastWasteVials as number[];
      const leastWaste = n(r, "leastWaste");
      const waste = n(get(ctx, "vials"), "waste");
      const which = least.length === 1 ? `A ${w.vialName(least[0])} vial` : `Vials of ${least.join(" + ")} ${w.measureWord}`;
      return {
        message: leastWaste === 0
          ? `${which} would have avoided the waste`
          : `${which} would have wasted ${w.qty(leastWaste)} instead of ${w.qty(waste)}`,
        rows,
      };
    }
    case "units": {
      if (r.status === "needs_info") return own;
      const total = n(r, "totalBilled");
      const max = n(r, "maxValidUnits");
      const excess = n(r, "excess");
      return {
        message: excess > 0
          ? `${excess} units billed above the ${max} that the record supports`
          : `${total} units billed, within the ${max} that the record supports`,
        formula:
          `${line.unitsBilled} administered + ${line.jwUnitsBilled} JW = ${total} billed; ` +
          (excess > 0 ? `${total} − ${max} = ${excess} excess` : `${total} ≤ ${max}, no excess`),
        rows,
      };
    }
    case "jw_jz": {
      if (r.status !== "flag" && r.status !== "pass") return own;
      const jw = line.jwUnitsBilled;
      const wasteUnits = n(r, "wasteUnits");
      if (r.status === "flag" && line.jzReported && jw > 0) return own; // JZ with JW: the logic's sentence is already plain
      let message: string;
      if (r.values.expected === "JZ")
        message = r.status === "pass"
          ? "No waste, and JZ is reported"
          : jw > 0
            ? `No waste, but a JW line is billed (${units(jw)}); JZ is expected instead`
            : "No waste, so JZ is expected, but it was not reported";
      else
        message = r.status === "pass"
          ? `The JW line bills ${units(jw)}, within the ${units(wasteUnits)} wasted`
          : jw === 0
            ? `${units(wasteUnits)} wasted, so a JW line is expected, but none was billed`
            : `The JW line bills ${units(jw)}, more than the ${units(wasteUnits)} wasted`;
      return { message, rows };
    }
    case "benchmark": {
      if (r.status !== "info") return own;
      const bpu = n(r, "billedPerUnit");
      const markup = n(r, "markup");
      const total = round4(line.unitsBilled + line.jwUnitsBilled); // the same sum the logic bills against
      return {
        message: `Billed ${usd(bpu)} per unit, ${markup.toFixed(2)}x the ${r.values.quarter} CMS payment limit (${w.limitText} per unit)`,
        formula:
          `${usd(line.amountBilled!)} ÷ ${total} units = ${usd(bpu)} per unit; ${usd(bpu)} ÷ ${w.limitText} = ${markup.toFixed(2)}x; ` +
          `${total} units × ${w.limitText} = ${usd(n(r, "benchmarkTotal"))}`,
        rows,
      };
    }
    case "dollars": {
      if (r.status !== "info" || line.contractType === "inpatient_drg") return own;
      const excess = n(get(ctx, "units"), "excess");
      const bpu = n(get(ctx, "benchmark"), "billedPerUnit");
      if (line.contractType === "asp_fee_schedule") {
        const pct = line.aspContractPercent;
        return {
          message: `${usd(n(r, "amount"))} at stake at ${pct}% of the CMS payment limit`,
          formula: `${excess} excess units × ${w.limitText} × ${pct}% = ${usd(n(r, "amount"))}`,
          rows,
        };
      }
      if (line.contractType === "percent_of_charges") {
        const pct = line.chargesContractPercent;
        return {
          message: `${usd(n(r, "amount"))} at stake at ${pct}% of billed charges`,
          formula: `${excess} excess units × ${usd(bpu)} billed per unit × ${pct}% = ${usd(n(r, "amount"))}`,
          rows,
        };
      }
      const atBilled = n(r, "amountAtBilledRate");
      const atLimit = n(r, "amountAtPaymentLimit");
      return {
        message: `${usd(atBilled)} at the billed rate, or ${usd(atLimit)} at the CMS payment limit; recovery depends on contract terms`,
        formula: `${excess} excess units × ${usd(bpu)} billed per unit = ${usd(atBilled)}; ${excess} excess units × ${w.limitText} = ${usd(atLimit)}`,
        rows,
      };
    }
    default:
      return own;
  }
}

function flagPhrase(r: CheckResult, ctx: Ctx): string {
  const { line } = ctx;
  if (r.id === "units") {
    const d = get(ctx, "dollars");
    let money = " (dollars at stake need info)";
    if (d?.status === "info") {
      if (line.contractType === "inpatient_drg") money = " ($0 at stake: drugs are bundled into the DRG case rate)";
      else if (d.values.amount !== undefined) money = ` (${usd(n(d, "amount"))} at stake, illustrative)`;
      else
        money = ` (${usd(n(d, "amountAtBilledRate"))} at the billed rate or ${usd(n(d, "amountAtPaymentLimit"))} at the CMS payment limit, illustrative)`;
    }
    return `${n(r, "excess")} excess units${money}`;
  }
  if (r.id === "jw_jz") {
    const jw = line.jwUnitsBilled;
    if (line.jzReported && jw > 0) return "JZ reported together with a JW line";
    if (r.values.expected === "JZ") return jw > 0 ? "JW billed with no waste" : "JZ expected but not reported";
    return jw === 0 ? "JW expected but not billed" : "JW units exceed the waste";
  }
  if (r.id === "vials")
    return n(r, "drawn") === undefined ? "a documented vial size is not on the label" : "documented vials do not cover the dose";
  return lowerFirst(TITLES[r.id]);
}

// One-line verdict, e.g. "2 flags: 100 excess units ($651.40 at stake, illustrative); JZ expected but not reported."
export function summarize(ctx: Ctx): string {
  const by = (s: CheckResult["status"]) => ctx.results.filter((r) => r.status === s);
  const flags = by("flag");
  const advisories = by("advisory");
  const needs = by("needs_info");
  const parts = [
    flags.length
      ? `${flags.length} ${plural(flags.length, "flag", "flags")}: ${flags.map((r) => flagPhrase(r, ctx)).join("; ")}.`
      : "No flags.",
  ];
  if (advisories.length)
    parts.push(
      `${advisories.length} ${plural(advisories.length, "advisory", "advisories")}: ` +
        `${advisories.map((r) => lowerFirst(describe(r, ctx).message.replace(/\.$/, ""))).join("; ")}.`,
    );
  if (needs.length) parts.push(`${needs.length} needs info: ${needs.map((r) => TITLES[r.id]).join(", ")}.`);
  return parts.join(" ");
}
