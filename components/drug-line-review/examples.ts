import hospital from "@/data/drug-line-review/hospital-charges.json";
import { cms } from "@/lib/drug-line-review/data";
import { usd } from "@/lib/drug-line-review/wording";
import { EMPTY_CLAIM, EMPTY_RECORD, type ClaimFormState, type RecordFormState } from "./forms";

// A charge built from the hospital price file: package count × gross charge per package.
export type HospitalCharge = { parts: { count: number; gross: number; per: string }[]; total: number };
export type Example = { label: string; claim: ClaimFormState; record: RecordFormState; hospitalCharge?: HospitalCharge };

// The NDC example is read from the CMS crosswalk JSON (the Remicade row for J1745).
const remicadeNdc = cms.crosswalk.find((r) => r.hcpcs === "J1745" && r.drugName.trim().toUpperCase() === "REMICADE")?.ndc;
if (!remicadeNdc) throw new Error("Remicade NDC not found in the CMS crosswalk JSON");

// Amounts billed are illustrative charges supplied for the demo, not from real claims.
const asp100 = { contractType: "asp_fee_schedule" as const, aspContractPercent: "100" };

// Reads the gross charge for a description (and package size, where the file lists several) from
// hospital-charges.json. Every matching row must agree, or the example is not built.
function hospitalCharge(description: string, setting: string, packages: [count: number, drugUnit: string][]): HospitalCharge {
  const parts = packages.map(([count, drugUnit]) => {
    const rows = hospital.items.filter(
      (x) => x.description === description && x.setting === setting && x.drugUnitOfMeasurement === drugUnit,
    );
    const charges = new Set(rows.map((x) => x.grossCharge));
    if (charges.size !== 1) throw new Error(`hospital charge for "${description}" (${setting}, ${drugUnit}) is missing or ambiguous`);
    const row = rows[0];
    if (!drugUnit && row.unitBasis !== "per HCPCS billing unit") throw new Error(`"${description}" has no package size`);
    const type = row.drugTypeOfMeasurement;
    if (drugUnit && type !== "UN" && type !== "ML") throw new Error(`"${description}": unit ${type} has no package wording`);
    // "1 UN" is one package; an mL amount is a package of that volume.
    const per = !drugUnit ? "billing unit" : type === "UN" ? "package" : `${drugUnit} mL package`;
    return { count, gross: row.grossCharge, per };
  });
  const total = Math.round(parts.reduce((a, p) => a + p.count * p.gross, 0) * 100) / 100;
  return { parts, total };
}

export const chargeFormula = (h: HospitalCharge) =>
  `${h.parts.map((p) => `${p.count} × ${usd(p.gross)} per ${p.per}`).join(" + ")} = ${usd(h.total)}`;

// A rev 0250 line whose description and gross charge come from the hospital file; the claim line,
// dose and patient are illustrative.
function hospitalExample(
  label: string, description: string, setting: string, packages: [number, string][],
  claim: Partial<ClaimFormState>, record: Partial<RecordFormState>,
): Example {
  const charge = hospitalCharge(description, setting, packages);
  return {
    label,
    claim: { ...EMPTY_CLAIM, lineType: "rev0250_description", description, amountBilled: charge.total.toFixed(2), ...claim },
    record: { ...EMPTY_RECORD, ...record },
    hospitalCharge: charge,
  };
}

export const EXAMPLES: Example[] = [
  {
    label: "Case 1: BOTOX, 200 units billed for a 100-unit dose (rev 0250 description)",
    claim: {
      ...EMPTY_CLAIM, lineType: "rev0250_description", description: "HC ONABOTULINUMTOXINA 100 UNIT INJ",
      unitsBilled: "200", jwUnitsBilled: "0", amountBilled: "5000",
    },
    record: { ...EMPTY_RECORD, doseAmount: "100", doseUnit: "units", vials: "100", ...asp100 },
  },
  {
    label: "Case 2: BOTOX, 100 units + 100 JW from a 200-unit vial (rev 0636 HCPCS)",
    claim: { ...EMPTY_CLAIM, lineType: "rev0636_hcpcs", hcpcs: "J0585", unitsBilled: "100", jwUnitsBilled: "100", amountBilled: "5000" },
    record: { ...EMPTY_RECORD, doseAmount: "100", doseUnit: "units", vials: "200", ...asp100 },
  },
  {
    label: "Case 3: Remicade 5 mg/kg at 80 kg, 50 units billed (NDC only)",
    claim: { ...EMPTY_CLAIM, lineType: "ndc_only", ndc: remicadeNdc, unitsBilled: "50", jwUnitsBilled: "0", amountBilled: "10000" },
    record: { ...EMPTY_RECORD, doseAmount: "5", doseUnit: "mg/kg", weightKg: "80", ...asp100 },
  },
  {
    label: "Case 4: Activase 0.9 mg/kg at 70 kg, 63 + 37 JW (rev 0636 HCPCS)",
    claim: { ...EMPTY_CLAIM, lineType: "rev0636_hcpcs", hcpcs: "J2997", unitsBilled: "63", jwUnitsBilled: "37", amountBilled: "30000" },
    record: { ...EMPTY_RECORD, doseAmount: "0.9", doseUnit: "mg/kg", weightKg: "70", ...asp100 },
  },
  {
    label: "Case 8: Rituxan 375 mg/m2 at BSA 1.8, 68 + 2 JW (rev 0636 HCPCS)",
    claim: { ...EMPTY_CLAIM, lineType: "rev0636_hcpcs", hcpcs: "J9312", unitsBilled: "68", jwUnitsBilled: "2", amountBilled: "24000" },
    record: { ...EMPTY_RECORD, doseAmount: "375", doseUnit: "mg/m2", bsaM2: "1.8", ...asp100 },
  },
  hospitalExample(
    "Hospital 1: BOTOX per-unit charge item, 200 units for a 200-unit dose, a clean line (rev 0250 description)",
    "HC-Botox a Medical per Unit", "outpatient", [[200, ""]],
    { unitsBilled: "200", jwUnitsBilled: "0", jzReported: true },
    { doseAmount: "200", doseUnit: "units", indicationId: "detrusor_overactivity_neurologic", ...asp100 },
  ),
  hospitalExample(
    "Hospital 2: Infliximab 100 mg package, 5 mg/kg at 72 kg, waste not billed as JW (rev 0250 description)",
    "INFLIXIMAB 100 MG INTRAVENOUS SOLUTION", "outpatient", [[4, "1"]],
    { unitsBilled: "36", jwUnitsBilled: "0" },
    { doseAmount: "5", doseUnit: "mg/kg", weightKg: "72", indicationId: "adult_crohns_disease", ...asp100 },
  ),
  hospitalExample(
    "Hospital 3: Alteplase 100 mg package, stroke dose capped at 90 mg, waste counted twice under a DRG (rev 0250 description)",
    "ALTEPLASE 100 MG INTRAVENOUS SOLUTION", "inpatient", [[1, "1"]],
    { unitsBilled: "100", jwUnitsBilled: "10" },
    { doseAmount: "0.9", doseUnit: "mg/kg", weightKg: "110", indicationId: "acute_ischemic_stroke", contractType: "inpatient_drg" },
  ),
  hospitalExample(
    "Hospital 4: Bevacizumab per-10-mg charge item, three 400 mg vials, vial choice advisory (rev 0250 description)",
    "HC-(per 10 Mg) Bevacizumab Inj", "outpatient", [[120, ""]],
    { unitsBilled: "105", jwUnitsBilled: "15" },
    { doseAmount: "15", doseUnit: "mg/kg", weightKg: "70", indicationId: "first_line_nonsquamous_nsclc", vials: "400, 400, 400", ...asp100 },
  ),
  hospitalExample(
    "Hospital 5: Rituximab 10 mg/mL packages, 375 mg/m2 at BSA 2.0, waste counted twice under percent of charges (rev 0250 description)",
    "RITUXIMAB 10 MG/ML CONCENTRATE,INTRAVENOUS", "outpatient", [[1, "50"], [3, "10"]],
    { unitsBilled: "80", jwUnitsBilled: "5" },
    { doseAmount: "375", doseUnit: "mg/m2", bsaM2: "2.0", indicationId: "non_hodgkins_lymphoma", contractType: "percent_of_charges", chargesContractPercent: "50" },
  ),
];
