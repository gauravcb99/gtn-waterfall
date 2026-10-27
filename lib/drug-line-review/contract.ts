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
  // message: full sentence for the card; cause: short clause for the page summary.
  const needs = (message: string, cause: string): CheckResult => ({
    ...base, status: "needs_info", message, summary: `dollars at stake, because ${cause}`, values: {},
  });
  const noRate = () =>
    needs(
      "The billed price per unit is unavailable, because the amount billed is blank or no units are billed.",
      "the amount billed is blank or no units are billed",
    );

  switch (line.contractType) {
    case "asp_fee_schedule": {
      const pct = line.aspContractPercent;
      if (pct === undefined)
        return needs("The % of CMS payment limit is missing. It is required for an ASP fee schedule contract.",
          "the % of CMS payment limit is missing");
      const amount = round4((excess * limit * pct) / 100);
      return {
        ...base, status: "info", values: { amount },
        message: `${usd(amount)} at stake at ${pct}% of the CMS payment limit`,
        formula: `${excess} excess units × ${limitText(limit)} × ${pct}% = ${usd(amount)}`,
      };
    }
    case "percent_of_charges": {
      const pct = line.chargesContractPercent;
      if (pct === undefined)
        return needs("The % of billed charges is missing. It is required for a percent of charges contract.",
          "the % of billed charges is missing");
      if (billedPerUnit === undefined) return noRate();
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
      if (billedPerUnit === undefined) return noRate();
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
