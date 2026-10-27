import { round4 } from "./data";
import type { CheckResult, Citation, ClaimLine } from "./types";
import { limitText, usd } from "./wording";

const LABEL = "illustrative, depends on the contract";

// Dollars at stake on the excess units. No legal or contract conclusions.
export function dollarsAtStake(
  line: ClaimLine,
  excess: number,
  limit: number,
  billedPerUnit: number | undefined,
  citations: Citation[],
): CheckResult {
  const base = { id: "dollars" as const, label: LABEL, citations };
  const needs = (reason: string): CheckResult => ({ ...base, status: "needs_info", message: `needs info: ${reason}`, values: {} });
  const noRate = "billed per unit is unavailable (amount billed blank or no units billed)";

  switch (line.contractType) {
    case "asp_fee_schedule": {
      const pct = line.aspContractPercent;
      if (pct === undefined) return needs("aspContractPercent is required for an ASP fee schedule contract");
      const amount = round4((excess * limit * pct) / 100);
      return {
        ...base, status: "info", values: { amount },
        message: `${usd(amount)} at stake at ${pct}% of the CMS payment limit`,
        formula: `${excess} excess units × ${limitText(limit)} × ${pct}% = ${usd(amount)}`,
      };
    }
    case "percent_of_charges": {
      const pct = line.chargesContractPercent;
      if (pct === undefined) return needs("chargesContractPercent is required for a percent of charges contract");
      if (billedPerUnit === undefined) return needs(noRate);
      const amount = round4((excess * billedPerUnit * pct) / 100);
      return {
        ...base, status: "info", values: { amount },
        message: `${usd(amount)} at stake at ${pct}% of billed charges`,
        formula: `${excess} excess units × ${usd(billedPerUnit)} billed per unit × ${pct}% = ${usd(amount)}`,
      };
    }
    case "inpatient_drg":
      return {
        ...base, status: "info", message: "$0: drugs are bundled into the DRG case rate", values: { amount: 0 },
        formula: "$0 (drugs are bundled into the DRG case rate)",
      };
    case "stoploss_outlier_carveout":
    case "reference_based": {
      if (billedPerUnit === undefined) return needs(noRate);
      const amountAtBilledRate = round4(excess * billedPerUnit);
      const amountAtPaymentLimit = round4(excess * limit);
      return {
        ...base, status: "info", values: { amountAtBilledRate, amountAtPaymentLimit },
        message: `${usd(amountAtBilledRate)} at the billed rate, or ${usd(amountAtPaymentLimit)} at the CMS payment limit; recovery depends on contract terms`,
        formula:
          `${excess} excess units × ${usd(billedPerUnit)} billed per unit = ${usd(amountAtBilledRate)}; ` +
          `${excess} excess units × ${limitText(limit)} = ${usd(amountAtPaymentLimit)}`,
      };
    }
  }
}
