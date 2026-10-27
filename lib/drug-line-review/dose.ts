import { measure, round4 } from "./data";
import { billingUnits, vocab } from "./wording";
import type { Citation, ClaimLine, Drug } from "./types";

export type DoseCalc =
  | {
      ok: true;
      doseAmount: number;
      doseUnits: number;
      message: string;
      formula: string;
      cap?: { text: string; cite: Citation };
      advisory?: { text: string; summary: string; cites: Citation[] };
    }
  | { ok: false; reason: string; cause: string }; // reason: full sentence; cause: short clause for the summary

// Converts the documented dose into the drug's billing measure (e.g. mg) and billing units.
export function computeDose(line: ClaimLine, drug: Drug): DoseCalc {
  const { amount, unit } = line.dose;
  const bu = drug.billingUnit.value;
  const wanted = unit === "units" ? "UNIT" : "MG";
  if (measure(bu.unit) !== wanted)
    return {
      ok: false, cause: "the dose unit does not match the billing unit",
      reason: `The dose unit "${unit}" does not match the billing unit (${drug.billingUnitRaw.value}).`,
    };
  if (!(amount > 0)) return { ok: false, reason: "The documented dose amount is missing.", cause: "the dose amount is missing" };
  const selected = line.indicationId && line.indicationId !== "other" ? line.indicationId : undefined;
  const entry = selected ? drug.dosing.find((x) => x.id === selected) : undefined;
  if (selected && !entry)
    return {
      ok: false, cause: "the indication is not a dosing entry for this drug",
      reason: `The indication "${selected}" is not a dosing entry for ${drug.id}.`,
    };

  let doseAmount: number;
  const steps: string[] = [];
  if (unit === "mg/kg") {
    if (!(line.weightKg! > 0)) return { ok: false, reason: "A weight in kg is required for a mg/kg dose.", cause: "the weight is missing" };
    doseAmount = round4(amount * line.weightKg!);
    steps.push(`${amount} mg/kg × ${line.weightKg} kg = ${doseAmount} mg`);
  } else if (unit === "mg/m2") {
    if (!(line.bsaM2! > 0))
      return { ok: false, reason: "A BSA in m2 from the record is required for a mg/m2 dose.", cause: "the BSA is missing" };
    doseAmount = round4(amount * line.bsaM2!);
    steps.push(`${amount} mg/m2 × ${line.bsaM2} m2 = ${doseAmount} mg`);
  } else {
    doseAmount = amount;
  }

  // Label maximum total dose, for computed (weight- or BSA-based) doses only. It caps the dose only
  // when the selected indication's entry states one; with no indication, it becomes an advisory.
  let cap: { text: string; cite: Citation } | undefined;
  let advisory: { text: string; summary: string; cites: Citation[] } | undefined;
  if (unit === "mg/kg" || unit === "mg/m2") {
    const withMax = (entry ? [entry] : drug.dosing).filter((x) => x.maxTotalDose);
    const bad = withMax.find((x) => measure(x.maxTotalDose!.value.unit) !== measure(bu.unit));
    if (bad)
      return {
        ok: false, cause: "the label maximum unit does not match the billing unit",
        reason: `The label maximum unit "${bad.maxTotalDose!.value.unit}" does not match the billing unit (${drug.billingUnitRaw.value}).`,
      };
    const exceeded = withMax.filter((x) => doseAmount > x.maxTotalDose!.value.amount);
    const text = (x: (typeof exceeded)[number]) => `${x.maxTotalDose!.value.amount} ${x.maxTotalDose!.value.unit}`;
    if (entry && exceeded.length) {
      cap = { text: `capped at label maximum (${text(entry)})`, cite: entry.maxTotalDose!.cite };
      doseAmount = entry.maxTotalDose!.value.amount;
      steps.push(cap.text);
    } else if (!entry && exceeded.length) {
      const which = exceeded.map((x) => `${x.indication.value}: ${text(x)}`).join("; ");
      advisory = {
        text: `Label maximum depends on indication (${which}). Select the indication from the record.`,
        summary: `label maximum depends on indication (${which}). Select the indication from the record`,
        cites: exceeded.map((x) => x.maxTotalDose!.cite),
      };
    }
  }
  const doseUnits = round4(doseAmount / bu.amount);
  const { qty, buText } = vocab(drug);
  steps.push(`${qty(doseAmount)} ÷ ${buText} = ${billingUnits(doseUnits)}`);
  return {
    ok: true, doseAmount, doseUnits, cap, advisory,
    message: `Dose: ${qty(doseAmount)} = ${billingUnits(doseUnits)} (${buText} each)${cap ? `, ${cap.text}` : ""}`,
    formula: steps.join("; "),
  };
}

// Smallest total >= dose that the vial sizes can make; fewest vials breaks ties. Sorted largest first.
export function leastWasteCombination(sizes: number[], dose: number): number[] {
  if (!sizes.length || sizes.some((s) => !Number.isInteger(s) || s <= 0))
    throw new Error(`vial sizes must be positive integers: ${sizes}`);
  const desc = [...sizes].sort((a, b) => b - a);
  const limit = Math.ceil(dose) + desc[0];
  const count: number[] = new Array(limit + 1).fill(Infinity);
  const last: number[] = new Array(limit + 1).fill(0);
  count[0] = 0;
  for (let t = 1; t <= limit; t++)
    for (const s of desc)
      if (s <= t && count[t - s] + 1 < count[t]) {
        count[t] = count[t - s] + 1;
        last[t] = s;
      }
  let t = Math.ceil(dose);
  while (count[t] === Infinity) t++;
  const combo: number[] = [];
  for (; t > 0; t -= last[t]) combo.push(last[t]);
  return combo.sort((a, b) => b - a);
}
