import { measure, round4 } from "./data";
import type { Citation, ClaimLine, Drug } from "./types";

export type DoseCalc =
  | { ok: true; doseAmount: number; doseUnits: number; formula: string; cap?: { text: string; cite: Citation } }
  | { ok: false; reason: string };

// Converts the documented dose into the drug's billing measure (e.g. mg) and billing units.
export function computeDose(line: ClaimLine, drug: Drug): DoseCalc {
  const { amount, unit } = line.dose;
  const bu = drug.billingUnit.value;
  const wanted = unit === "units" ? "UNIT" : "MG";
  if (measure(bu.unit) !== wanted)
    return { ok: false, reason: `dose unit "${unit}" does not match the billing unit ${drug.billingUnitRaw.value}` };
  if (!(amount > 0)) return { ok: false, reason: "documented dose amount missing" };

  let doseAmount: number;
  let formula: string;
  if (unit === "mg/kg") {
    if (!(line.weightKg! > 0)) return { ok: false, reason: "weight (kg) is required for a mg/kg dose" };
    doseAmount = round4(amount * line.weightKg!);
    formula = `${amount} mg/kg x ${line.weightKg} kg = ${doseAmount} mg`;
  } else if (unit === "mg/m2") {
    if (!(line.bsaM2! > 0)) return { ok: false, reason: "BSA (m2) from the record is required for a mg/m2 dose" };
    doseAmount = round4(amount * line.bsaM2!);
    formula = `${amount} mg/m2 x ${line.bsaM2} m2 = ${doseAmount} mg`;
  } else {
    doseAmount = amount;
    formula = `${amount} ${unit}`;
  }

  // Label maximum total dose, applied to computed (weight- or BSA-based) doses only.
  let cap: { text: string; cite: Citation } | undefined;
  const maxes = drug.dosing.flatMap((x) => (x.maxTotalDose ? [x.maxTotalDose] : []));
  if (maxes.length > 1) return { ok: false, reason: "more than one label maximum dose; indication is not modeled" };
  if (maxes.length && (unit === "mg/kg" || unit === "mg/m2")) {
    const max = maxes[0].value;
    if (measure(max.unit) !== measure(bu.unit))
      return { ok: false, reason: `label maximum unit "${max.unit}" does not match the billing unit ${drug.billingUnitRaw.value}` };
    if (doseAmount > max.amount) {
      cap = { text: `capped at label maximum (${max.amount} ${max.unit})`, cite: maxes[0].cite };
      doseAmount = max.amount;
      formula += `; ${cap.text}`;
    }
  }
  const doseUnits = round4(doseAmount / bu.amount);
  return { ok: true, doseAmount, doseUnits, cap, formula: `${formula}; / ${drug.billingUnitRaw.value} = ${doseUnits} units` };
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
