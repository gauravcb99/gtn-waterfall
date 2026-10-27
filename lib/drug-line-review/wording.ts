import { measure } from "./data";
import type { Drug } from "./types";

// Shared wording for result messages and formulas. Tests pin the resulting strings.

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
export const units = (n: number) => `${n} ${plural(n, "unit", "units")}`; // billing units
export const billingUnits = (n: number) => `${n} billing ${plural(n, "unit", "units")}`;
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
export const limitText = (limit: number) => `$${limit}`; // full CMS precision, e.g. $6.514

// Amounts in the drug's billing measure: "100 units" for BOTOX, "400 mg" for the others.
export function vocab(drug: Drug) {
  const bu = drug.billingUnit.value;
  const isUnit = measure(bu.unit) === "UNIT";
  const qty = (n: number) => (isUnit ? units(n) : `${n} mg`);
  return {
    qty,
    buText: qty(bu.amount), // "1 unit", "10 mg"
    vialName: (s: number) => (isUnit ? `${s}-unit` : `${s} mg`),
    measureWord: isUnit ? "units" : "mg",
  };
}
