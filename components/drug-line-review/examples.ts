import { cms } from "@/lib/drug-line-review/data";
import { EMPTY_CLAIM, EMPTY_RECORD, type ClaimFormState, type RecordFormState } from "./forms";

export type Example = { label: string; claim: ClaimFormState; record: RecordFormState };

// The NDC example is read from the CMS crosswalk JSON (the Remicade row for J1745).
const remicadeNdc = cms.crosswalk.find((r) => r.hcpcs === "J1745" && r.drugName.trim().toUpperCase() === "REMICADE")?.ndc;
if (!remicadeNdc) throw new Error("Remicade NDC not found in the CMS crosswalk JSON");

// Amounts billed are illustrative charges supplied for the demo, not from real claims.
const asp100 = { contractType: "asp_fee_schedule" as const, aspContractPercent: "100" };

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
];
