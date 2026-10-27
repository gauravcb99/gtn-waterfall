export type LineType = "rev0250_description" | "rev0636_hcpcs" | "ndc_only";
export type DoseUnit = "units" | "mg" | "mg/kg" | "mg/m2";
export type ContractType =
  | "asp_fee_schedule"
  | "percent_of_charges"
  | "inpatient_drg"
  | "stoploss_outlier_carveout"
  | "reference_based";

export type ClaimLine = {
  lineType: LineType;
  description: string;
  hcpcs?: string;
  ndc?: string;
  unitsBilled: number; // administered line
  jwUnitsBilled: number; // 0 if no JW line
  jzReported: boolean;
  amountBilled?: number; // total $ for the drug on this claim; blank gives needs info where charges are used
  dose: { amount: number; unit: DoseUnit };
  indicationId?: string; // a dosing entry id of the confirmed drug, or "other"
  weightKg?: number;
  bsaM2?: number; // typed from the record, never calculated
  vialsUsed?: number[];
  contractType: ContractType;
  aspContractPercent?: number;
  chargesContractPercent?: number;
};

export type Citation = {
  source: string;
  setid?: string;
  file?: string;
  section: string;
  quote: string;
};

type Cited<T> = { value: T; cite: Citation };

export type Drug = {
  id: string;
  genericName: Cited<string>;
  brandAliases: Cited<string[]>;
  hcpcs: Cited<string>;
  hcpcsDescriptor: Cited<string>;
  billingUnitRaw: Cited<string>;
  billingUnit: Cited<{ amount: number; unit: string }>;
  vialSizes: Cited<{ amount: number; unit: string; ndcs: string[] }>[];
  singleDose: Cited<boolean>;
  dosing: {
    id: string;
    indication: Cited<string>;
    dose: Cited<{ amount: number; unit: string }>;
    maxTotalDose?: Cited<{ amount: number; unit: string }>;
  }[];
};

export type MatchCandidate = {
  drugId: string;
  confidence?: "HIGH" | "MEDIUM";
  matchedTokens?: string[];
  normalizedNdc?: string;
  crosswalkDrugName?: string;
};

export type MatchResult =
  | { status: "candidates"; candidates: MatchCandidate[] }
  | { status: "no_match"; reason: string }
  | { status: "needs_info"; reason: string };

export type CheckStatus = "pass" | "flag" | "advisory" | "needs_info" | "info" | "not_applicable";

export type CheckResult = {
  id: "dose" | "dose_advisory" | "vials" | "vial_advisory" | "units" | "jw_jz" | "benchmark" | "dollars";
  status: CheckStatus;
  message: string;
  values: Record<string, number | string | boolean | number[]>;
  citations: Citation[];
  label?: string;
  formula?: string;
  summary?: string; // short phrase for the results summary; set on every flag, advisory and needs-info result
  waitsOn?: "dose"; // needs info only because the dose could not be worked out; the summary counts these instead
};

export type ChecksOutcome =
  | { status: "ran"; drugId: string; results: CheckResult[] }
  | { status: "refused"; reason: string };
