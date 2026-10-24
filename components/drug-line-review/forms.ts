import type { ClaimLine, ContractType, DoseUnit, LineType } from "@/lib/drug-line-review/types";

// Form state keeps raw strings so blank stays blank (blank never becomes a guessed value).
export type ClaimFormState = {
  lineType: LineType;
  description: string;
  hcpcs: string;
  ndc: string;
  unitsBilled: string;
  jwUnitsBilled: string;
  jzReported: boolean;
  amountBilled: string;
};

export type RecordFormState = {
  indicationId: string; // "" = not selected
  doseAmount: string;
  doseUnit: DoseUnit | "";
  weightKg: string;
  bsaM2: string;
  vials: string;
  contractType: ContractType | "";
  aspContractPercent: string;
  chargesContractPercent: string;
};

export const EMPTY_CLAIM: ClaimFormState = {
  lineType: "rev0636_hcpcs",
  description: "",
  hcpcs: "",
  ndc: "",
  unitsBilled: "",
  jwUnitsBilled: "",
  jzReported: false,
  amountBilled: "",
};

export const EMPTY_RECORD: RecordFormState = {
  indicationId: "",
  doseAmount: "",
  doseUnit: "",
  weightKg: "",
  bsaM2: "",
  vials: "",
  contractType: "",
  aspContractPercent: "",
  chargesContractPercent: "",
};

const num = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

export function toClaimLine(c: ClaimFormState, r: RecordFormState): { line: ClaimLine } | { error: string } {
  const unitsBilled = num(c.unitsBilled);
  if (unitsBilled === undefined || Number.isNaN(unitsBilled)) return { error: "Enter the units billed on the administered line." };
  if (!r.doseUnit) return { error: "Choose the documented dose unit." };
  if (!r.contractType) return { error: "Choose a contract type." };

  let vialsUsed: number[] | undefined;
  if (r.vials.trim()) {
    vialsUsed = r.vials.split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (vialsUsed.some((v) => !(v > 0))) return { error: "Vial sizes must be positive numbers separated by commas." };
  }

  return {
    line: {
      lineType: c.lineType,
      description: c.description,
      hcpcs: c.hcpcs || undefined,
      ndc: c.ndc || undefined,
      unitsBilled,
      jwUnitsBilled: num(c.jwUnitsBilled) ?? 0,
      jzReported: c.jzReported,
      amountBilled: num(c.amountBilled),
      dose: { amount: num(r.doseAmount) ?? 0, unit: r.doseUnit },
      indicationId: r.indicationId || undefined,
      weightKg: r.doseUnit === "mg/kg" ? num(r.weightKg) : undefined,
      bsaM2: r.doseUnit === "mg/m2" ? num(r.bsaM2) : undefined,
      vialsUsed,
      contractType: r.contractType,
      aspContractPercent: r.contractType === "asp_fee_schedule" ? num(r.aspContractPercent) : undefined,
      chargesContractPercent: r.contractType === "percent_of_charges" ? num(r.chargesContractPercent) : undefined,
    },
  };
}
