import { dollarsAtStake } from "./contract";
import { cms, findDrug, jwJzCitations, paymentLimit, round4 } from "./data";
import { computeDose, leastWasteCombination } from "./dose";
import type { CheckResult, ChecksOutcome, Citation, ClaimLine } from "./types";

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
  const buCite = drug.billingUnit.cite;
  const vialCites = drug.vialSizes.map((v) => v.cite);
  const cmsCite: Citation = { ...drug.hcpcs.cite, section: `${cms.metadata.quarter}, ${drug.hcpcs.cite.section}` };
  const results: CheckResult[] = [];

  // Benchmark (does not depend on the dose).
  const totalBilled = round4(line.unitsBilled + line.jwUnitsBilled);
  let billedPerUnit: number | undefined;
  let benchmark: CheckResult;
  if (totalBilled > 0) {
    billedPerUnit = round4(line.amountBilled / totalBilled);
    const markup = round4(billedPerUnit / limit);
    const benchmarkTotal = round4(totalBilled * limit);
    benchmark = {
      id: "benchmark", status: "info", citations: [cmsCite],
      message: `billed $${billedPerUnit.toFixed(2)}/unit is ${markup.toFixed(2)}x the ${cms.metadata.quarter} CMS payment limit`,
      values: { paymentLimit: limit, billedPerUnit, markup, benchmarkTotal, quarter: cms.metadata.quarter },
      formula:
        `$${line.amountBilled} / ${totalBilled} units = $${billedPerUnit.toFixed(2)}/unit; ` +
        `/ $${limit} = ${markup.toFixed(2)}x; ${totalBilled} units x $${limit} = $${benchmarkTotal.toFixed(2)}`,
    };
  } else {
    benchmark = { id: "benchmark", status: "needs_info", citations: [cmsCite], message: "no units billed", values: {} };
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
    id: "dose", status: "info",
    message: `dose ${dose.doseAmount} = ${dose.doseUnits} billing units${dose.cap ? `, ${dose.cap.text}` : ""}`,
    values: { doseAmount: dose.doseAmount, doseUnits: dose.doseUnits, capped: !!dose.cap },
    citations: dose.cap ? [buCite, dose.cap.cite] : [buCite], formula: dose.formula,
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
  results.push({
    id: "vials",
    status: covers ? "pass" : "flag",
    message: covers ? `drawn ${drawn}, waste ${waste}` : "documented vials do not cover documented dose",
    values: { vials, basis: documented ? "documented" : "assumed: least-waste combination", drawn, waste, wasteUnits, maxValidUnits },
    citations: [...vialCites, buCite],
    formula: `drawn ${vials.join(" + ")} = ${drawn}; waste ${drawn} - ${dose.doseAmount} = ${waste}; max valid ${drawn} / ${drug.billingUnitRaw.value} = ${maxValidUnits} units`,
  });
  if (documented && covers) {
    const least = leastWasteCombination(sizes, dose.doseAmount);
    const leastWaste = round4(sum(least) - dose.doseAmount);
    if (waste > leastWaste)
      results.push({
        id: "vial_advisory", status: "advisory",
        message: `documented waste ${waste} exceeds the least possible waste ${leastWaste} (vials ${least.join(" + ")})`,
        values: { leastWasteVials: least, leastWaste }, citations: vialCites,
      });
  }

  // Units.
  const excess = round4(totalBilled - maxValidUnits);
  results.push({
    id: "units",
    status: excess > 0 ? "flag" : "pass",
    message: excess > 0 ? `${excess} units billed above the ${maxValidUnits} valid units` : "billed units within valid units",
    values: { totalBilled, maxValidUnits, excess: Math.max(0, excess) },
    citations: [buCite, ...vialCites],
    formula: `${line.unitsBilled} + ${line.jwUnitsBilled} JW = ${totalBilled}; ${totalBilled} - ${maxValidUnits} = ${excess}`,
  });

  // JW / JZ (single-dose containers only).
  const jw = (status: CheckResult["status"], message: string, expected: string): CheckResult => ({
    id: "jw_jz", status, message, label: JW_JZ_LABEL, citations: [...jwJzCitations, drug.singleDose.cite],
    values: {
      expected, administeredUnits: dose.doseUnits, wasteUnits, jwUnitsBilled: line.jwUnitsBilled, jzReported: line.jzReported,
    },
  });
  if (!drug.singleDose.value) {
    results.push(jw("not_applicable", "not a single-dose container", "none"));
  } else if (!covers) {
    results.push(jw("needs_info", "needs info: documented vials do not cover documented dose", "unknown"));
  } else if (line.jzReported && line.jwUnitsBilled > 0) {
    results.push(jw("flag", "JZ attests no discarded amount, but a JW line is billed.", waste > 0 ? "JW" : "JZ"));
  } else if (waste > 0) {
    if (!Number.isInteger(dose.doseUnits) || !Number.isInteger(wasteUnits))
      results.push(jw("needs_info", `needs info: fractional unit split, rounding rule not modeled (administered ${dose.doseUnits}, waste ${wasteUnits} units)`, "JW"));
    else if (line.jwUnitsBilled === 0) results.push(jw("flag", `JW line for ${wasteUnits} waste units expected; none billed`, "JW"));
    else if (line.jwUnitsBilled > wasteUnits)
      results.push(jw("flag", `JW units ${line.jwUnitsBilled} exceed the ${wasteUnits} waste units`, "JW"));
    else results.push(jw("pass", `JW ${line.jwUnitsBilled} units within ${wasteUnits} waste units`, "JW"));
  } else {
    if (line.jwUnitsBilled > 0) results.push(jw("flag", "no waste, but a JW line is billed; JZ expected", "JZ"));
    else if (!line.jzReported) results.push(jw("flag", "no waste; JZ expected but not reported", "JZ"));
    else results.push(jw("pass", "no waste; JZ reported", "JZ"));
  }

  results.push(benchmark);
  results.push(dollarsAtStake(line, Math.max(0, excess), limit, billedPerUnit, [cmsCite]));
  return { status: "ran", drugId: drug.id, results };
}
