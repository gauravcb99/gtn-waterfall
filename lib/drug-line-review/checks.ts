import { dollarsAtStake } from "./contract";
import { cms, findDrug, jwJzCitations, paymentLimit, round4 } from "./data";
import { computeDose, leastWasteCombination } from "./dose";
import type { CheckResult, ChecksOutcome, Citation, ClaimLine } from "./types";
import { billingUnits, limitText, plural, units, usd, vocab } from "./wording";

const JW_JZ_LABEL = "Medicare Part B requirement (CMS JW/JZ FAQ); commercial payer rules vary.";
const sum = (xs: number[]) => round4(xs.reduce((a, b) => a + b, 0));

// Runs every check on one claim drug line. Requires a drug id the user confirmed from matchLine.
export function runChecks(line: ClaimLine, confirmedDrugId: string | undefined | null): ChecksOutcome {
  if (!confirmedDrugId)
    return { status: "refused", reason: "a confirmed drug id is required; matching only identifies candidates" };
  const drug = findDrug(confirmedDrugId);
  if (!drug) return { status: "refused", reason: `drug id ${confirmedDrugId} is not in the library` };

  const bu = drug.billingUnit.value;
  const limit = paymentLimit(drug.hcpcs.value);
  const { qty, buText, vialName, measureWord } = vocab(drug);
  const buCite = drug.billingUnit.cite;
  const vialCites = drug.vialSizes.map((v) => v.cite);
  const cmsCite: Citation = { ...drug.hcpcs.cite, section: `${cms.metadata.quarter}, ${drug.hcpcs.cite.section}` };
  const results: CheckResult[] = [];

  // Benchmark (does not depend on the dose).
  const totalBilled = round4(line.unitsBilled + line.jwUnitsBilled);
  let billedPerUnit: number | undefined;
  let benchmark: CheckResult;
  if (totalBilled > 0 && line.amountBilled !== undefined) {
    billedPerUnit = round4(line.amountBilled / totalBilled);
    const markup = round4(billedPerUnit / limit);
    const benchmarkTotal = round4(totalBilled * limit);
    const quarter = cms.metadata.quarter;
    benchmark = {
      id: "benchmark", status: "info", citations: [cmsCite],
      message: `Billed ${usd(billedPerUnit)} per unit, ${markup.toFixed(2)}x the ${quarter} CMS payment limit (${limitText(limit)} per unit)`,
      values: { paymentLimit: limit, billedPerUnit, markup, benchmarkTotal, quarter },
      formula:
        `${usd(line.amountBilled)} ÷ ${totalBilled} units = ${usd(billedPerUnit)} per unit; ` +
        `${usd(billedPerUnit)} ÷ ${limitText(limit)} = ${markup.toFixed(2)}x; ` +
        `${totalBilled} units × ${limitText(limit)} = ${usd(benchmarkTotal)}`,
    };
  } else {
    benchmark = {
      id: "benchmark", status: "needs_info", citations: [cmsCite], values: {},
      message: totalBilled > 0 ? "needs info: amount billed is blank" : "needs info: no units billed",
    };
  }

  // Dose.
  const dose = computeDose(line, drug);
  if (!dose.ok) {
    results.push({ id: "dose", status: "needs_info", message: `needs info: ${dose.reason}`, values: {}, citations: [buCite] });
    for (const id of ["vials", "units", "jw_jz", "dollars"] as const)
      results.push({ id, status: "needs_info", message: `needs info: requires the dose (${dose.reason})`, values: {}, citations: [buCite] });
    results.push(benchmark);
    return { status: "ran", drugId: drug.id, results };
  }
  results.push({
    id: "dose", status: "info", message: dose.message,
    values: { doseAmount: dose.doseAmount, doseUnits: dose.doseUnits, capped: !!dose.cap },
    citations: dose.cap ? [buCite, dose.cap.cite] : [buCite], formula: dose.formula,
  });
  if (dose.advisory)
    results.push({
      id: "dose_advisory", status: "advisory", message: dose.advisory.text, summary: dose.advisory.summary,
      values: {}, citations: dose.advisory.cites,
    });

  // Vials and waste.
  const sizes = drug.vialSizes.map((v) => v.value.amount);
  const documented = !!line.vialsUsed?.length;
  const vials = documented ? [...line.vialsUsed!].sort((a, b) => b - a) : leastWasteCombination(sizes, dose.doseAmount);
  const unlabeled = Array.from(new Set(vials.filter((s) => !sizes.includes(s))));
  if (unlabeled.length) {
    const labeled = drug.vialSizes.map((v) => `${v.value.amount} ${v.value.unit}`).join(", ");
    results.push({
      id: "vials", status: "flag", citations: vialCites,
      message: unlabeled.map((s) => `${s} is not a labeled vial size; labeled sizes: ${labeled}`).join("; "),
      summary: "a documented vial size is not on the label",
      values: { vials, basis: "documented" },
    });
    const reason = "needs info: documented vial size is not on the label, so waste cannot be determined";
    for (const id of ["units", "jw_jz", "dollars"] as const)
      results.push({ id, status: "needs_info", message: reason, values: {}, citations: vialCites });
    results.push(benchmark);
    return { status: "ran", drugId: drug.id, results };
  }
  const drawn = sum(vials);
  const covers = drawn >= dose.doseAmount;
  const waste = round4(drawn - dose.doseAmount);
  const wasteUnits = round4(waste / bu.amount);
  const maxValidUnits = round4(drawn / bu.amount);
  const count = vials.length;
  const validPart = `${qty(drawn)} ÷ ${buText} = ${maxValidUnits} valid billing units`;
  const vialValues = { vials, basis: documented ? "documented" : "assumed: least-waste combination", drawn, waste, wasteUnits, maxValidUnits };
  if (covers)
    results.push({
      id: "vials", status: "pass", values: vialValues, citations: [...vialCites, buCite],
      message:
        `Drew ${qty(drawn)} from ${count} ${plural(count, "vial", "vials")}${count > 1 ? ` (${vials.join(" + ")})` : ""}, ` +
        `${waste === 0 ? "no waste" : `${qty(waste)} wasted (${billingUnits(wasteUnits)})`}` +
        `${documented ? "" : " (assumed: least-waste combination)"}`,
      formula:
        `${count > 1 ? `${vials.join(" + ")} = ${qty(drawn)} drawn` : `${qty(drawn)} drawn (1 vial)`}; ` +
        `${qty(drawn)} − ${qty(dose.doseAmount)} = ${qty(waste)} waste; ${validPart}`,
    });
  else
    results.push({
      id: "vials", status: "flag", values: vialValues, citations: [...vialCites, buCite],
      message:
        `The documented ${count > 1 ? `vials (${vials.join(" + ")} = ${qty(drawn)})` : `vial (${qty(drawn)})`} ` +
        `${count > 1 ? "do" : "does"} not cover the documented dose (${qty(dose.doseAmount)})`,
      summary: "documented vials do not cover the dose",
      formula: `${vials.join(" + ")} = ${qty(drawn)} drawn, less than the ${qty(dose.doseAmount)} dose; ${validPart}`,
    });
  if (documented && covers) {
    const least = leastWasteCombination(sizes, dose.doseAmount);
    const leastWaste = round4(sum(least) - dose.doseAmount);
    if (waste > leastWaste) {
      const which = least.length === 1 ? `${vialName(least[0])} vial` : `${least.join(" + ")} ${measureWord}`;
      const outcome = leastWaste === 0 ? "would have avoided the waste" : `would have wasted ${qty(leastWaste)} instead of ${qty(waste)}`;
      results.push({
        id: "vial_advisory", status: "advisory",
        message: `${least.length === 1 ? `A ${which}` : `Vials of ${which}`} ${outcome}`,
        summary: `${least.length === 1 ? `a ${which}` : `vials of ${which}`} ${outcome}`,
        values: { leastWasteVials: least, leastWaste }, citations: vialCites,
      });
    }
  }

  // Units.
  const excess = round4(totalBilled - maxValidUnits);
  results.push({
    id: "units",
    status: excess > 0 ? "flag" : "pass",
    message: excess > 0
      ? `${excess} units billed above the ${maxValidUnits} that the record supports`
      : `${totalBilled} units billed, within the ${maxValidUnits} that the record supports`,
    summary: excess > 0 ? `${excess} excess ${plural(excess, "unit", "units")}` : undefined,
    values: { totalBilled, maxValidUnits, excess: Math.max(0, excess) },
    citations: [buCite, ...vialCites],
    formula:
      `${line.unitsBilled} administered + ${line.jwUnitsBilled} JW = ${totalBilled} billed; ` +
      (excess > 0 ? `${totalBilled} − ${maxValidUnits} = ${excess} excess` : `${totalBilled} ≤ ${maxValidUnits}, no excess`),
  });

  // JW / JZ (single-dose containers only).
  const jwUnits = line.jwUnitsBilled;
  const jw = (status: CheckResult["status"], message: string, expected: string, summary?: string): CheckResult => ({
    id: "jw_jz", status, message, summary, label: JW_JZ_LABEL, citations: [...jwJzCitations, drug.singleDose.cite],
    values: { expected, administeredUnits: dose.doseUnits, wasteUnits, jwUnitsBilled: jwUnits, jzReported: line.jzReported },
  });
  if (!drug.singleDose.value) {
    results.push(jw("not_applicable", "not a single-dose container", "none"));
  } else if (!covers) {
    results.push(jw("needs_info", "needs info: documented vials do not cover documented dose", "unknown"));
  } else if (line.jzReported && jwUnits > 0) {
    results.push(jw("flag", "JZ attests no discarded amount, but a JW line is billed.", waste > 0 ? "JW" : "JZ",
      "JZ reported together with a JW line"));
  } else if (waste > 0) {
    if (!Number.isInteger(dose.doseUnits) || !Number.isInteger(wasteUnits))
      results.push(jw("needs_info", `needs info: fractional unit split, rounding rule not modeled (administered ${dose.doseUnits}, waste ${wasteUnits} units)`, "JW"));
    else if (jwUnits === 0)
      results.push(jw("flag", `${units(wasteUnits)} wasted, so a JW line is expected, but none was billed`, "JW", "JW expected but not billed"));
    else if (jwUnits > wasteUnits)
      results.push(jw("flag", `The JW line bills ${units(jwUnits)}, more than the ${units(wasteUnits)} wasted`, "JW", "JW units exceed the waste"));
    else results.push(jw("pass", `The JW line bills ${units(jwUnits)}, within the ${units(wasteUnits)} wasted`, "JW"));
  } else {
    if (jwUnits > 0)
      results.push(jw("flag", `No waste, but a JW line is billed (${units(jwUnits)}); JZ is expected instead`, "JZ", "JW billed with no waste"));
    else if (!line.jzReported)
      results.push(jw("flag", "No waste, so JZ is expected, but it was not reported", "JZ", "JZ expected but not reported"));
    else results.push(jw("pass", "No waste, and JZ is reported", "JZ"));
  }

  results.push(benchmark);
  results.push(dollarsAtStake(line, Math.max(0, excess), limit, billedPerUnit, [cmsCite]));
  return { status: "ran", drugId: drug.id, results };
}
