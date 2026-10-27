// Run with: npx tsx scripts/test-drug-line-review.ts
import assert from "node:assert/strict";
import { parseCsv, validateDrugs } from "./build-drug-line-data";
import { EXCLUDED_PRODUCTS, matchLine } from "../lib/drug-line-review/match";
import cmsJson from "../data/drug-line-review/cms-asp-oct-2026.json";
import hospital from "../data/drug-line-review/hospital-charges.json";
import { drugs } from "../lib/drug-line-review/data";
import { EXAMPLES } from "../components/drug-line-review/examples";
import { toClaimLine, type ClaimFormState, type RecordFormState } from "../components/drug-line-review/forms";
import { summarize } from "../components/drug-line-review/display";
import { runChecks } from "../lib/drug-line-review/checks";
import type { CheckResult, ClaimLine } from "../lib/drug-line-review/types";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}

// --- parseCsv ---

test("parseCsv: plain fields and CRLF line endings", () => {
  assert.deepEqual(parseCsv("a,b,c\r\n1,2,3\r\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("parseCsv: quoted field containing a comma", () => {
  assert.deepEqual(parseCsv('J0585,"Injection,onabotulinumtoxina",1 UNIT\r\n'), [
    ["J0585", "Injection,onabotulinumtoxina", "1 UNIT"],
  ]);
});

test("parseCsv: doubled quotes inside a quoted field", () => {
  assert.deepEqual(parseCsv('Q9998,"""lesser of"" methodology applied",x\r\n'), [
    ["Q9998", '"lesser of" methodology applied', "x"],
  ]);
});

test("parseCsv: empty trailing fields are kept", () => {
  assert.deepEqual(parseCsv("a,,\r\n"), [["a", "", ""]]);
});

// --- validateDrugs ---

const cms = {
  codes: [{ hcpcs: "J9999", shortDescription: "Test drug", dosage: "10 MG", paymentLimit: 1 }],
};
const sources = { sources: [{ id: "cms", url: "u" }, { id: "label", url: "u" }] };
const cmsCite = { source: "cms", file: "f.csv", section: "row J9999", quote: "J9999,Test drug,10 MG" };
const labelCite = { source: "label", setid: "s", section: "16", quote: "100 mg vial" };

function validDrug() {
  return {
    id: "J9999",
    genericName: { value: "testmab", cite: labelCite },
    hcpcs: { value: "J9999", cite: cmsCite },
    hcpcsDescriptor: { value: "Test drug", cite: cmsCite },
    billingUnitRaw: { value: "10 MG", cite: cmsCite },
    billingUnit: { value: { amount: 10, unit: "MG" }, cite: cmsCite },
    vialSizes: [{ value: { amount: 100, unit: "mg" }, cite: labelCite }],
    dosing: [{ indication: { value: "X", cite: labelCite } }],
  };
}

test("validateDrugs: a fully cited drug passes", () => {
  assert.deepEqual(validateDrugs({ drugs: [validDrug()] }, cms, sources), []);
});

test("validateDrugs: a bare uncited value fails", () => {
  const d: Record<string, unknown> = validDrug();
  d.singleDose = true;
  assert.equal(validateDrugs({ drugs: [d] }, cms, sources).length, 1);
});

test("validateDrugs: an empty quote fails", () => {
  const d = validDrug();
  d.genericName = { value: "testmab", cite: { ...labelCite, quote: "" } };
  assert.equal(validateDrugs({ drugs: [d] }, cms, sources).length, 1);
});

test("validateDrugs: a citation with neither setid nor file fails", () => {
  const d = validDrug();
  d.genericName = { value: "testmab", cite: { source: "label", section: "16", quote: "q" } as typeof labelCite };
  assert.equal(validateDrugs({ drugs: [d] }, cms, sources).length, 1);
});

test("validateDrugs: an unknown source id fails", () => {
  const d = validDrug();
  d.genericName = { value: "testmab", cite: { ...labelCite, source: "nope" } };
  assert.equal(validateDrugs({ drugs: [d] }, cms, sources).length, 1);
});

test("validateDrugs: an HCPCS code missing from CMS fails", () => {
  const d = validDrug();
  d.hcpcs = { value: "J0000", cite: cmsCite };
  assert.ok(validateDrugs({ drugs: [d] }, cms, sources).length >= 1);
});

test("validateDrugs: billing unit raw text that differs from CMS fails", () => {
  const d = validDrug();
  d.billingUnitRaw = { value: "1 MG", cite: cmsCite };
  assert.ok(validateDrugs({ drugs: [d] }, cms, sources).length >= 1);
});

test("validateDrugs: billing unit amount that differs from CMS fails", () => {
  const d = validDrug();
  d.billingUnit = { value: { amount: 1, unit: "MG" }, cite: cmsCite };
  assert.ok(validateDrugs({ drugs: [d] }, cms, sources).length >= 1);
});

test("validateDrugs: a descriptor that differs from CMS fails", () => {
  const d = validDrug();
  d.hcpcsDescriptor = { value: "Other", cite: cmsCite };
  assert.ok(validateDrugs({ drugs: [d] }, cms, sources).length >= 1);
});

// --- Stage 2: claim line checks ---

function line(over: Partial<ClaimLine>): ClaimLine {
  return {
    lineType: "rev0636_hcpcs",
    description: "",
    unitsBilled: 0,
    jwUnitsBilled: 0,
    jzReported: false,
    amountBilled: 0,
    dose: { amount: 0, unit: "mg" },
    contractType: "asp_fee_schedule",
    aspContractPercent: 100,
    ...over,
  };
}

function check(l: ClaimLine, drugId: string) {
  const r = runChecks(l, drugId);
  if (r.status !== "ran") throw new Error(`checks did not run: ${r.reason}`);
  const get = (id: CheckResult["id"]) => {
    const c = r.results.find((x) => x.id === id);
    if (!c) throw new Error(`no ${id} result`);
    return c;
  };
  return { results: r.results, get };
}

const money = (n: unknown) => (n as number).toFixed(2);

test("every check result carries at least one citation with a quote", () => {
  const { results } = check(
    line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 200, amountBilled: 1000 }),
    "J0585",
  );
  for (const r of results) {
    assert.ok(r.citations.length > 0, `${r.id} has no citation`);
    for (const c of r.citations) assert.ok(c.quote.trim() !== "", `${r.id} citation has an empty quote`);
  }
});

test("case 1: J0585 100 units, vials [100], billed 200, no JW/JZ", () => {
  const { get } = check(
    line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 200, amountBilled: 1000 }),
    "J0585",
  );
  assert.equal(get("vials").values.maxValidUnits, 100);
  assert.equal(get("vials").values.waste, 0);
  assert.equal(get("units").status, "flag");
  assert.equal(get("units").values.excess, 100);
  assert.equal(get("jw_jz").status, "flag");
  assert.equal(get("jw_jz").values.expected, "JZ");
  assert.equal(money(get("dollars").values.amount), "651.40");
  assert.match(get("dollars").label!, /illustrative, depends on the contract/);
  assert.ok(get("dollars").formula);
});

test("case 2: J0585 100 units, vials [200], billed 100 + 100 JW: pass, JW valid, advisory", () => {
  const { get } = check(
    line({
      hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [200],
      unitsBilled: 100, jwUnitsBilled: 100, amountBilled: 1000,
    }),
    "J0585",
  );
  assert.equal(get("units").status, "pass");
  assert.equal(get("jw_jz").status, "pass");
  assert.equal(get("jw_jz").values.expected, "JW");
  assert.equal(get("vial_advisory").status, "advisory");
  assert.deepEqual(get("vial_advisory").values.leastWasteVials, [100]);
});

test("case 3: J1745 5 mg/kg, 80 kg, vials undocumented, billed 50 for $10,000", () => {
  const base = {
    hcpcs: "J1745", dose: { amount: 5, unit: "mg/kg" as const }, weightKg: 80,
    unitsBilled: 50, amountBilled: 10000,
  };
  const { get } = check(line(base), "J1745");
  assert.equal(get("dose").values.doseAmount, 400);
  assert.equal(get("dose").values.doseUnits, 40);
  assert.deepEqual(get("vials").values.vials, [100, 100, 100, 100]);
  assert.equal(get("vials").values.basis, "assumed: least-waste combination");
  assert.equal(get("vials").values.waste, 0);
  assert.equal(get("jw_jz").values.expected, "JZ");
  assert.equal(get("units").values.excess, 10);
  assert.equal(money(get("benchmark").values.billedPerUnit), "200.00");
  assert.equal((get("benchmark").values.markup as number).toFixed(2), "6.70");
  assert.equal(money(get("benchmark").values.benchmarkTotal), "1492.80");
  assert.equal(money(get("dollars").values.amount), "298.56");
  const poc = check(line({ ...base, contractType: "percent_of_charges", chargesContractPercent: 50 }), "J1745");
  assert.equal(money(poc.get("dollars").values.amount), "1000.00");
});

test("case 4: J2997 0.9 mg/kg, 70 kg: 63 mg, one 100 mg vial, waste 37", () => {
  const base = { hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" as const }, weightKg: 70, amountBilled: 5000 };
  const ok = check(line({ ...base, unitsBilled: 63, jwUnitsBilled: 37 }), "J2997");
  assert.equal(ok.get("dose").values.doseAmount, 63);
  assert.deepEqual(ok.get("vials").values.vials, [100]);
  assert.equal(ok.get("vials").values.waste, 37);
  assert.equal(ok.get("vials").values.maxValidUnits, 100);
  assert.equal(ok.get("units").status, "pass");
  assert.equal(ok.get("jw_jz").status, "pass");
  const over = check(line({ ...base, unitsBilled: 83, jwUnitsBilled: 37 }), "J2997");
  assert.equal(over.get("units").values.excess, 20);
});

test("case 5: J1745 mg/kg with no weight: needs info, no calculation", () => {
  const { get } = check(line({ hcpcs: "J1745", dose: { amount: 5, unit: "mg/kg" }, unitsBilled: 40 }), "J1745");
  assert.equal(get("dose").status, "needs_info");
  assert.equal(get("dose").values.doseAmount, undefined);
  for (const id of ["vials", "units", "jw_jz", "dollars"] as const) assert.equal(get(id).status, "needs_info");
});

test("case 6: description 'HC UNKNOWN DRUG 5 MG' has no match, and checks don't run", () => {
  const l = line({ lineType: "rev0250_description", description: "HC UNKNOWN DRUG 5 MG" });
  const m = matchLine(l);
  assert.equal(m.status, "no_match");
  assert.equal(runChecks(l, undefined).status, "refused");
});

test("case 7: a flagged case under inpatient_drg is $0 with the bundling explanation", () => {
  const { get } = check(
    line({
      hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 200,
      amountBilled: 1000, contractType: "inpatient_drg",
    }),
    "J0585",
  );
  assert.equal(get("units").status, "flag");
  assert.equal(get("dollars").values.amount, 0);
  assert.match(get("dollars").message, /drugs are bundled into the DRG case rate/);
});

test("case 8: J9312 375 mg/m2, BSA 1.8: 675 mg, 500+100+100, fractional JW needs info", () => {
  const base = { hcpcs: "J9312", dose: { amount: 375, unit: "mg/m2" as const }, bsaM2: 1.8, amountBilled: 9000 };
  const ok = check(line({ ...base, unitsBilled: 68, jwUnitsBilled: 2 }), "J9312");
  assert.equal(ok.get("dose").values.doseAmount, 675);
  assert.deepEqual(ok.get("vials").values.vials, [500, 100, 100]);
  assert.equal(ok.get("vials").values.waste, 25);
  assert.equal(ok.get("vials").values.wasteUnits, 2.5);
  assert.equal(ok.get("vials").values.maxValidUnits, 70);
  assert.equal(ok.get("units").status, "pass");
  assert.equal(ok.get("jw_jz").status, "needs_info");
  assert.equal(ok.get("jw_jz").message, "Fractional unit split: 67.5 administered and 2.5 wasted units. The rule for rounding a JW split isn't modeled, so the JW unit count can't be checked.");
  assert.equal(ok.get("jw_jz").values.administeredUnits, 67.5);
  assert.equal(ok.get("jw_jz").values.wasteUnits, 2.5);
  const over = check(line({ ...base, unitsBilled: 78, jwUnitsBilled: 2 }), "J9312");
  assert.equal(over.get("units").values.excess, 10);
});

test("case 9: J9312 mg/m2 with no BSA: needs info", () => {
  const { get } = check(line({ hcpcs: "J9312", dose: { amount: 375, unit: "mg/m2" }, unitsBilled: 70 }), "J9312");
  assert.equal(get("dose").status, "needs_info");
  assert.equal(get("dose").values.doseAmount, undefined);
});

const desc = (description: string) => matchLine(line({ lineType: "rev0250_description", description }));

test("case 10a: 'HC ONABOTULINUMTOXINA 100 UNIT INJ' -> J0585 HIGH with matched tokens", () => {
  const m = desc("HC ONABOTULINUMTOXINA 100 UNIT INJ");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates.length, 1);
  assert.equal(m.candidates[0].drugId, "J0585");
  assert.equal(m.candidates[0].confidence, "HIGH");
  assert.deepEqual(m.candidates[0].matchedTokens, ["ONABOTULINUMTOXINA", "100", "UNIT"]);
});

test("case 10b: 'REMICADE' -> J1745 MEDIUM", () => {
  const m = desc("REMICADE");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates[0].drugId, "J1745");
  assert.equal(m.candidates[0].confidence, "MEDIUM");
  assert.deepEqual(m.candidates[0].matchedTokens, ["REMICADE"]);
});

test("case 10c: 'HC BOTULINUM TOXIN 100 UNIT' -> no match (ambiguous)", () => {
  const m = desc("HC BOTULINUM TOXIN 100 UNIT");
  assert.equal(m.status, "no_match");
  assert.match((m as { reason: string }).reason, /ambiguous/);
});

test("case 10d: 'INFLIXIMAB-DYYB 100 MG' -> no match (biosimilar)", () => {
  const m = desc("INFLIXIMAB-DYYB 100 MG");
  assert.equal(m.status, "no_match");
  assert.match((m as { reason: string }).reason, /biosimilar, different HCPCS, not in library/);
});

test("case 10e: 'CATHFLO ACTIVASE 2 MG' -> no match (excluded)", () => {
  const m = desc("CATHFLO ACTIVASE 2 MG");
  assert.equal(m.status, "no_match");
  assert.match((m as { reason: string }).reason, /excluded product/);
});

test("rev0636_hcpcs: exact HCPCS match", () => {
  const m = matchLine(line({ hcpcs: "J1745" }));
  assert.equal(m.status, "candidates");
  if (m.status === "candidates") assert.equal(m.candidates[0].drugId, "J1745");
  assert.equal(matchLine(line({ hcpcs: "J9999" })).status, "no_match");
});

test("case 11a: NDC '0023-1145-01' -> 00023114501 -> J0585", () => {
  const m = matchLine(line({ lineType: "ndc_only", ndc: "0023-1145-01" }));
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates[0].drugId, "J0585");
  assert.equal(m.candidates[0].normalizedNdc, "00023114501");
});

test("case 11b: NDC '0023114501' (10 digits, no hyphens) -> needs info", () => {
  assert.equal(matchLine(line({ lineType: "ndc_only", ndc: "0023114501" })).status, "needs_info");
});

test("case 12: checks refuse to run without a confirmed drug id", () => {
  const l = line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, unitsBilled: 100 });
  assert.equal(runChecks(l, undefined).status, "refused");
  assert.equal(runChecks(l, "").status, "refused");
  assert.equal(runChecks(l, "J0000").status, "refused");
});

test("documented vials that do not cover the dose are flagged", () => {
  const { get } = check(
    line({ hcpcs: "J0585", dose: { amount: 200, unit: "units" }, vialsUsed: [100], unitsBilled: 200, amountBilled: 1 }),
    "J0585",
  );
  assert.equal(get("vials").status, "flag");
  assert.equal(get("vials").message, "The documented vial (100 units) does not cover the documented dose (200 units)");
});

test("asp_fee_schedule without aspContractPercent: needs info", () => {
  const { get } = check(
    line({
      hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 200,
      amountBilled: 1000, aspContractPercent: undefined,
    }),
    "J0585",
  );
  assert.equal(get("dollars").status, "needs_info");
});

test("percent_of_charges without chargesContractPercent: needs info", () => {
  const { get } = check(
    line({
      hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 200,
      amountBilled: 1000, contractType: "percent_of_charges",
    }),
    "J0585",
  );
  assert.equal(get("dollars").status, "needs_info");
});

test("stoploss and reference_based show both amounts and the contract caveat", () => {
  for (const contractType of ["stoploss_outlier_carveout", "reference_based"] as const) {
    const { get } = check(
      line({
        hcpcs: "J1745", dose: { amount: 5, unit: "mg/kg" }, weightKg: 80, unitsBilled: 50,
        amountBilled: 10000, contractType,
      }),
      "J1745",
    );
    assert.equal(money(get("dollars").values.amountAtBilledRate), "2000.00");
    assert.equal(money(get("dollars").values.amountAtPaymentLimit), "298.56");
    assert.match(get("dollars").message, /recovery depends on contract terms/);
  }
});

test("JW/JZ result carries the Medicare-only label and cites the FAQ", () => {
  const { get } = check(
    line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100], unitsBilled: 100, jzReported: true }),
    "J0585",
  );
  assert.equal(get("jw_jz").status, "pass");
  assert.equal(get("jw_jz").label, "Medicare Part B requirement (CMS JW/JZ FAQ); commercial payer rules vary.");
  assert.ok(get("jw_jz").citations.some((c) => c.source === "cms-jw-jz-faq"));
});

test("a dose unit that does not match the billing measure: needs info", () => {
  const { get } = check(line({ hcpcs: "J0585", dose: { amount: 100, unit: "mg" }, unitsBilled: 100 }), "J0585");
  assert.equal(get("dose").status, "needs_info");
});

// --- Stage 2.1 ---

const ndc = (n: string) => matchLine(line({ lineType: "ndc_only", ndc: n }));

test("2.1 ndc_only: '50242-0041-10' -> excluded Cathflo Activase", () => {
  const m = ndc("50242-0041-10");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, "excluded product: Cathflo Activase (different product under J2997)");
});

test("2.1 ndc_only: '00023-3919-50' -> excluded BOTOX Cosmetic", () => {
  const m = ndc("00023-3919-50");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, "excluded product: BOTOX Cosmetic (cosmetic product, not in library)");
});

function medium(description: string, tokens: string[]) {
  const m = desc(description);
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates.length, 1);
  assert.equal(m.candidates[0].drugId, "J0585");
  assert.equal(m.candidates[0].confidence, "MEDIUM");
  assert.deepEqual(m.candidates[0].matchedTokens, tokens);
}

test("2.1 'HC ONA BOTULINUM TOXIN 100 UNIT' -> J0585 MEDIUM", () => {
  medium("HC ONA BOTULINUM TOXIN 100 UNIT", ["ONA", "BOTULINUM"]);
});

test("2.1 'HC ONABOTULINUM 200 UNITS' -> J0585 MEDIUM (never HIGH with a strength)", () => {
  medium("HC ONABOTULINUM 200 UNITS", ["ONABOTULINUM"]);
});

test("2.1 'ABOBOTULINUMTOXINA 300 UNIT' -> no match", () => {
  assert.equal(desc("ABOBOTULINUMTOXINA 300 UNIT").status, "no_match");
});

test("2.1 'INCOBOTULINUMTOXINA 100 UNIT' -> no match", () => {
  assert.equal(desc("INCOBOTULINUMTOXINA 100 UNIT").status, "no_match");
});

test("2.1 JZ reported with a JW line: JW/JZ flagged", () => {
  const { get } = check(
    line({
      hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [200],
      unitsBilled: 100, jwUnitsBilled: 100, jzReported: true, amountBilled: 1000,
    }),
    "J0585",
  );
  assert.equal(get("jw_jz").status, "flag");
  assert.equal(get("jw_jz").message, "JZ attests no discarded amount, but a JW line is billed.");
});

test("2.1 documented vial size not on the label: vials flagged, units and JW/JZ needs info", () => {
  const { get } = check(
    line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [300], unitsBilled: 100, amountBilled: 1000 }),
    "J0585",
  );
  assert.equal(get("vials").status, "flag");
  assert.match(get("vials").message, /^300 is not a labeled vial size; labeled sizes: 100 Units, 200 Units/);
  assert.ok(get("vials").citations.some((c) => c.source === "dailymed-botox" && c.section.startsWith("16")));
  assert.equal(get("units").status, "needs_info");
  assert.equal(get("jw_jz").status, "needs_info");
});

// --- Stage 2.2 ---

test("2.2 'BOTOX COSMETIC 100 UNIT' -> excluded BOTOX Cosmetic", () => {
  const m = desc("BOTOX COSMETIC 100 UNIT");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, "excluded product: BOTOX Cosmetic (cosmetic product, not in library)");
});

test("2.2 'BOTOX 100 UNIT' -> still J0585 HIGH", () => {
  const m = desc("BOTOX 100 UNIT");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates[0].drugId, "J0585");
  assert.equal(m.candidates[0].confidence, "HIGH");
});

test("2.2 guard: every exclusion name exists in the CMS crosswalk JSON (fails if CMS renames a product)", () => {
  const names = Object.keys(EXCLUDED_PRODUCTS);
  assert.deepEqual(names.sort(), ["BOTOX COSMETIC", "CATHFLO ACTIVASE"]);
  for (const name of names)
    assert.ok(
      cmsJson.crosswalk.some((r) => r.drugName.trim().toUpperCase() === name),
      `no crosswalk row has drug name "${name}"; CMS may have renamed the product, update the exclusion`,
    );
});

// --- Stage 2.3 ---

test("2.3 J2997 0.9 mg/kg, 110 kg: capped at the label maximum 90 mg, one 100 mg vial, waste 10", () => {
  const { get } = check(
    line({
      hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" }, weightKg: 110, indicationId: "acute_ischemic_stroke",
      unitsBilled: 90, jwUnitsBilled: 10, amountBilled: 5000,
    }),
    "J2997",
  );
  assert.equal(get("dose").values.doseAmount, 90);
  assert.equal(get("dose").values.capped, true);
  assert.match(get("dose").message, /capped at label maximum \(90 mg\)/);
  assert.ok(get("dose").citations.some((c) => c.section === "2.1 Acute Ischemic Stroke" && /not to exceed 90 mg/.test(c.quote)));
  assert.deepEqual(get("vials").values.vials, [100]);
  assert.equal(get("vials").values.waste, 10);
  assert.equal(get("units").status, "pass");
  assert.equal(get("jw_jz").status, "pass");
});

test("2.3 J2997 0.9 mg/kg, 70 kg: 63 mg, not capped", () => {
  const { get } = check(
    line({ hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" }, weightKg: 70, unitsBilled: 63, jwUnitsBilled: 37 }),
    "J2997",
  );
  assert.equal(get("dose").values.doseAmount, 63);
  assert.equal(get("dose").values.capped, false);
  assert.doesNotMatch(get("dose").message, /capped/);
});

test("2.3 maxTotalDose appears only on the Activase entry, cited with the label quote", () => {
  const withMax = drugs.flatMap((d) => d.dosing.filter((x) => x.maxTotalDose).map((x) => ({ id: d.id, x })));
  assert.equal(withMax.length, 1);
  assert.equal(withMax[0].id, "J2997");
  assert.deepEqual(withMax[0].x.maxTotalDose!.value, { amount: 90, unit: "mg" });
  assert.match(withMax[0].x.maxTotalDose!.cite.quote, /not to exceed 90 mg total dose/);
});

// --- Stage 3 Part A: indication-aware cap; optional amount billed ---

const activase110 = (over: Partial<ClaimLine>) =>
  check(
    line({
      hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" }, weightKg: 110,
      unitsBilled: 90, jwUnitsBilled: 10, amountBilled: 5000, ...over,
    }),
    "J2997",
  );
const ADVISORY = "Label maximum depends on indication (Acute Ischemic Stroke: 90 mg). Select the indication from the record.";

test("3A J2997 0.9 mg/kg, 110 kg, no indication: 99 mg, not capped, advisory present and cited", () => {
  const { get } = activase110({});
  assert.equal(get("dose").values.doseAmount, 99);
  assert.equal(get("dose").values.capped, false);
  assert.equal(get("dose_advisory").status, "advisory");
  assert.equal(get("dose_advisory").message, ADVISORY);
  assert.ok(get("dose_advisory").citations.some((c) => /not to exceed 90 mg/.test(c.quote)));
});

test("3A J2997 0.9 mg/kg, 110 kg, indication 'other': not capped, advisory present", () => {
  const { get } = activase110({ indicationId: "other" });
  assert.equal(get("dose").values.doseAmount, 99);
  assert.equal(get("dose_advisory").message, ADVISORY);
});

test("3A J2997 0.9 mg/kg, 70 kg, no indication: 63 mg, no advisory", () => {
  const { results, get } = check(
    line({ hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" }, weightKg: 70, unitsBilled: 63, jwUnitsBilled: 37 }),
    "J2997",
  );
  assert.equal(get("dose").values.doseAmount, 63);
  assert.ok(!results.some((r) => r.id === "dose_advisory"));
});

test("3A capped line under acute_ischemic_stroke has no advisory", () => {
  const { results } = activase110({ indicationId: "acute_ischemic_stroke" });
  assert.ok(!results.some((r) => r.id === "dose_advisory"));
});

test("3A an indication id that is not on the drug: needs info", () => {
  const { get } = activase110({ indicationId: "rheumatoid_arthritis" });
  assert.equal(get("dose").status, "needs_info");
});

test("3A every dosing entry has a non-empty id, unique within its drug", () => {
  for (const d of drugs) {
    const ids = d.dosing.map((x) => x.id);
    assert.ok(ids.every((id) => typeof id === "string" && id !== "" && id !== "other"), `${d.id}: bad dosing id`);
    assert.equal(new Set(ids).size, ids.length, `${d.id}: duplicate dosing id`);
  }
});

test("validateDrugs: a dosing entry id needs no citation, but must be a string", () => {
  const ok: Record<string, unknown> = validDrug();
  ok.dosing = [{ id: "x", indication: { value: "X", cite: labelCite } }];
  assert.deepEqual(validateDrugs({ drugs: [ok] }, cms, sources), []);
  const bad: Record<string, unknown> = validDrug();
  bad.dosing = [{ id: 7, indication: { value: "X", cite: labelCite } }];
  assert.equal(validateDrugs({ drugs: [bad] }, cms, sources).length, 1);
});

const case3NoAmount = (over: Partial<ClaimLine>) =>
  check(
    line({
      hcpcs: "J1745", dose: { amount: 5, unit: "mg/kg" }, weightKg: 80, unitsBilled: 50,
      amountBilled: undefined, ...over,
    }),
    "J1745",
  );

test("3A amount billed blank: benchmark needs info; ASP dollars still compute", () => {
  const { get } = case3NoAmount({});
  assert.equal(get("benchmark").status, "needs_info");
  assert.equal(get("units").values.excess, 10);
  assert.equal(money(get("dollars").values.amount), "298.56");
});

test("3A amount billed blank: charge-based dollars need info; DRG still $0", () => {
  for (const contractType of ["percent_of_charges", "stoploss_outlier_carveout", "reference_based"] as const)
    assert.equal(case3NoAmount({ contractType, chargesContractPercent: 50 }).get("dollars").status, "needs_info");
  assert.equal(case3NoAmount({ contractType: "inpatient_drg" }).get("dollars").values.amount, 0);
});

// --- Stage 3.2: wording pinned in lib (built from the page's own examples) ---

const EXAMPLE_IDS = ["J0585", "J0585", "J1745", "J2997", "J9312"];
function example(i: number, record: Partial<RecordFormState> = {}, claim: Partial<ClaimFormState> = {}) {
  const r = toClaimLine({ ...EXAMPLES[i].claim, ...claim }, { ...EXAMPLES[i].record, ...record });
  if ("error" in r) throw new Error(r.error);
  return { ...check(r.line, EXAMPLE_IDS[i]), line: r.line };
}
const pin = (r: CheckResult, message: string, formula?: string) => {
  assert.equal(r.message, message);
  if (formula !== undefined) assert.equal(r.formula, formula);
};

test("3.2 example case 1: dose, vials, units, JW/JZ, benchmark, dollars wording", () => {
  const { get } = example(0);
  pin(get("dose"), "Dose: 100 units = 100 billing units (1 unit each)", "100 units ÷ 1 unit = 100 billing units");
  pin(get("vials"), "Drew 100 units from 1 vial, no waste",
    "100 units drawn (1 vial); 100 units − 100 units = 0 units waste; 100 units ÷ 1 unit = 100 valid billing units");
  pin(get("units"), "100 units billed above the 100 that the record supports",
    "200 administered + 0 JW = 200 billed; 200 − 100 = 100 excess");
  pin(get("jw_jz"), "No waste, so JZ is expected, but it was not reported");
  pin(get("benchmark"), "Billed $25.00 per unit, 3.84x the October 2026 CMS payment limit ($6.514 per unit)",
    "$5,000.00 ÷ 200 units = $25.00 per unit; $25.00 ÷ $6.514 = 3.84x; 200 units × $6.514 = $1,302.80");
  pin(get("dollars"), "$651.40 at stake at 100% of the CMS payment limit", "100 excess units × $6.514 × 100% = $651.40");
});

test("3.2 example case 2: vials, vial advisory, units, JW wording", () => {
  const { get } = example(1);
  pin(get("vials"), "Drew 200 units from 1 vial, 100 units wasted (100 billing units)",
    "200 units drawn (1 vial); 200 units − 100 units = 100 units waste; 200 units ÷ 1 unit = 200 valid billing units");
  pin(get("vial_advisory"), "A 100-unit vial would have avoided the waste");
  pin(get("units"), "200 units billed, within the 200 that the record supports",
    "100 administered + 100 JW = 200 billed; 200 ≤ 200, no excess");
  pin(get("jw_jz"), "The JW line bills 100 units, within the 100 units wasted");
});

test("3.2 example case 3: weight-based dose, assumed vials, benchmark, dollars wording", () => {
  const { get } = example(2);
  pin(get("dose"), "Dose: 400 mg = 40 billing units (10 mg each)", "5 mg/kg × 80 kg = 400 mg; 400 mg ÷ 10 mg = 40 billing units");
  pin(get("vials"), "Drew 400 mg from 4 vials (100 + 100 + 100 + 100), no waste (assumed: least-waste combination)",
    "100 + 100 + 100 + 100 = 400 mg drawn; 400 mg − 400 mg = 0 mg waste; 400 mg ÷ 10 mg = 40 valid billing units");
  pin(get("units"), "10 units billed above the 40 that the record supports", "50 administered + 0 JW = 50 billed; 50 − 40 = 10 excess");
  pin(get("benchmark"), "Billed $200.00 per unit, 6.70x the October 2026 CMS payment limit ($29.856 per unit)",
    "$10,000.00 ÷ 50 units = $200.00 per unit; $200.00 ÷ $29.856 = 6.70x; 50 units × $29.856 = $1,492.80");
  pin(get("dollars"), "$298.56 at stake at 100% of the CMS payment limit", "10 excess units × $29.856 × 100% = $298.56");
});

test("3.2 example case 4: Activase vials, JW, dollars wording", () => {
  const { get } = example(3);
  pin(get("dose"), "Dose: 63 mg = 63 billing units (1 mg each)", "0.9 mg/kg × 70 kg = 63 mg; 63 mg ÷ 1 mg = 63 billing units");
  pin(get("vials"), "Drew 100 mg from 1 vial, 37 mg wasted (37 billing units) (assumed: least-waste combination)",
    "100 mg drawn (1 vial); 100 mg − 63 mg = 37 mg waste; 100 mg ÷ 1 mg = 100 valid billing units");
  pin(get("jw_jz"), "The JW line bills 37 units, within the 37 units wasted");
  pin(get("benchmark"), "Billed $300.00 per unit, 3.05x the October 2026 CMS payment limit ($98.416 per unit)",
    "$30,000.00 ÷ 100 units = $300.00 per unit; $300.00 ÷ $98.416 = 3.05x; 100 units × $98.416 = $9,841.60");
  pin(get("dollars"), "$0.00 at stake at 100% of the CMS payment limit", "0 excess units × $98.416 × 100% = $0.00");
});

test("3.2 example case 8: BSA-based dose, three vials, fractional JW, benchmark wording", () => {
  const { get } = example(4);
  pin(get("dose"), "Dose: 675 mg = 67.5 billing units (10 mg each)", "375 mg/m2 × 1.8 m2 = 675 mg; 675 mg ÷ 10 mg = 67.5 billing units");
  pin(get("vials"), "Drew 700 mg from 3 vials (500 + 100 + 100), 25 mg wasted (2.5 billing units) (assumed: least-waste combination)",
    "500 + 100 + 100 = 700 mg drawn; 700 mg − 675 mg = 25 mg waste; 700 mg ÷ 10 mg = 70 valid billing units");
  pin(get("jw_jz"), "Fractional unit split: 67.5 administered and 2.5 wasted units. The rule for rounding a JW split isn't modeled, so the JW unit count can't be checked.");
  pin(get("benchmark"), "Billed $342.86 per unit, 4.76x the October 2026 CMS payment limit ($72.094 per unit)",
    "$24,000.00 ÷ 70 units = $342.86 per unit; $342.86 ÷ $72.094 = 4.76x; 70 units × $72.094 = $5,046.58");
});

test("3.2 capped Activase (110 kg, acute ischemic stroke, 90 + 10 JW): dose and JW wording", () => {
  const { get } = example(3, { weightKg: "110", indicationId: "acute_ischemic_stroke" }, { unitsBilled: "90", jwUnitsBilled: "10" });
  pin(get("dose"), "Dose: 90 mg = 90 billing units (1 mg each), capped at label maximum (90 mg)",
    "0.9 mg/kg × 110 kg = 99 mg; capped at label maximum (90 mg); 90 mg ÷ 1 mg = 90 billing units");
  pin(get("jw_jz"), "The JW line bills 10 units, within the 10 units wasted");
});

test("3.2 stop-loss dollars wording keeps the full-precision payment limit", () => {
  const { get } = example(2, { contractType: "stoploss_outlier_carveout" });
  pin(get("dollars"), "$2,000.00 at the billed rate, or $298.56 at the CMS payment limit; recovery depends on contract terms",
    "10 excess units × $200.00 billed per unit = $2,000.00; 10 excess units × $29.856 = $298.56");
});

test("3.2 dollars needs info is a plain sentence (4a: no 'needs info:' prefix)", () => {
  const { get } = example(2, { contractType: "percent_of_charges", chargesContractPercent: "50" }, { amountBilled: "" });
  pin(get("dollars"), "The billed price per unit is unavailable, because the amount billed is blank or no units are billed.");
  const noPct = example(0, { aspContractPercent: "" });
  pin(noPct.get("dollars"), "The % of CMS payment limit is missing. It is required for an ASP fee schedule contract.");
});

test("3.2 documented vial that does not cover the dose: wording", () => {
  const { get } = example(0, { doseAmount: "200" });
  pin(get("vials"), "The documented vial (100 units) does not cover the documented dose (200 units)",
    "100 = 100 units drawn, less than the 200 units dose; 100 units ÷ 1 unit = 100 valid billing units");
});

test("3.2 every flag and advisory carries a summary phrase", () => {
  const runs = [example(0), example(1), example(2), example(3), example(4), example(0, { vials: "300" }),
    example(3, { weightKg: "110" }, { unitsBilled: "90", jwUnitsBilled: "10" })];
  for (const { results } of runs)
    for (const r of results.filter((x) => x.status === "flag" || x.status === "advisory"))
      assert.ok(r.summary && r.summary.trim() !== "", `${r.id} (${r.status}) has no summary phrase`);
});

test("3.2 page summary for case 1 and case 2", () => {
  const one = example(0);
  assert.equal(summarize({ line: one.line, results: one.results }),
    "2 flags: 100 excess units ($651.40 at stake, illustrative); JZ expected but not reported.");
  const two = example(1);
  assert.equal(summarize({ line: two.line, results: two.results }),
    "No flags. 1 advisory: a 100-unit vial would have avoided the waste.");
});

// --- Stage 4a: needs-info messages are plain sentences, and the summary gives a reason for each ---

const needsInfoRuns = () => [
  example(0), example(1), example(2), example(3), example(4),
  example(2, { weightKg: "" }), // no weight
  example(4, { bsaM2: "" }), // no BSA
  example(0, { vials: "300" }), // vial size not on the label
  example(0, { doseAmount: "200" }), // vials do not cover the dose
  example(2, { contractType: "percent_of_charges", chargesContractPercent: "50" }, { amountBilled: "" }),
  example(2, { contractType: "percent_of_charges" }),
  example(0, { aspContractPercent: "" }),
  example(3, { weightKg: "110", indicationId: "not_on_label" }),
  { ...check(line({ hcpcs: "J0585", dose: { amount: 100, unit: "mg" }, unitsBilled: 100 }), "J0585"), line: undefined },
  { ...check(line({ hcpcs: "J0585", dose: { amount: 100, unit: "units" }, vialsUsed: [100] }), "J0585"), line: undefined },
];

test("4a every needs-info message is a capitalized sentence without the 'needs info' prefix", () => {
  let seen = 0;
  for (const { results } of needsInfoRuns())
    for (const r of results.filter((x) => x.status === "needs_info")) {
      seen++;
      assert.doesNotMatch(r.message, /needs info/i, `${r.id}: ${r.message}`);
      assert.match(r.message, /^[A-Z%]/, `${r.id} does not start with a capital: ${r.message}`);
    }
  assert.ok(seen >= 20, `only ${seen} needs-info results exercised`);
});

test("4a every needs-info result carries a summary reason, or waits on the dose", () => {
  for (const { results } of needsInfoRuns())
    for (const r of results.filter((x) => x.status === "needs_info"))
      assert.ok((r.summary && r.summary.trim() !== "") || r.waitsOn === "dose", `${r.id} (needs_info) has no summary reason`);
});

test("4a case 8 summary gives the reason for the needs-info result", () => {
  const eight = example(4);
  assert.equal(summarize({ line: eight.line, results: eight.results }),
    "No flags. 1 needs info: the JW unit count, because the dose works out to 67.5 units.");
});

test("4a needs-info wording: missing weight, the checks that depend on the dose, and the summary", () => {
  const { get, line: l, results } = example(2, { weightKg: "" });
  pin(get("dose"), "A weight in kg is required for a mg/kg dose.");
  pin(get("units"), "This check needs the dose. A weight in kg is required for a mg/kg dose.");
  assert.equal(summarize({ line: l, results }),
    "No flags. 5 needs info: the dose, because the weight is missing; 4 checks wait on the dose.");
});

test("4a checks that wait on the dose are marked structurally, and only those", () => {
  const { results } = example(2, { weightKg: "" });
  assert.deepEqual(results.filter((r) => r.waitsOn === "dose").map((r) => r.id), ["vials", "units", "jw_jz", "dollars"]);
  for (const { results: rs } of needsInfoRuns())
    for (const r of rs.filter((x) => x.waitsOn === "dose")) assert.equal(rs.find((x) => x.id === "dose")?.status, "needs_info");
});

test("4a needs-info wording: blank amount billed under percent of charges, and the summary", () => {
  const { get, line: l, results } = example(2, { contractType: "percent_of_charges", chargesContractPercent: "50" }, { amountBilled: "" });
  pin(get("benchmark"), "The amount billed is blank, so the billed price per unit can't be compared with the CMS payment limit.");
  assert.equal(summarize({ line: l, results }),
    "2 flags: 10 excess units (dollars at stake need info); JZ expected but not reported. " +
      "2 needs info: the benchmark, because the amount billed is blank; dollars at stake, because the amount billed is blank or no units are billed.");
});

test("4a needs-info wording: vial size not on the label, and the summary", () => {
  const { get, line: l, results } = example(0, { vials: "300" });
  pin(get("units"), "A documented vial size is not on the label, so the waste can't be worked out.");
  assert.equal(summarize({ line: l, results }),
    "1 flag: a documented vial size is not on the label. 3 needs info: units billed, because a documented vial size is not on the label; " +
      "the JW / JZ modifiers, because a documented vial size is not on the label; dollars at stake, because a documented vial size is not on the label.");
});

test("4a needs-info wording: JW/JZ when the documented vials do not cover the dose", () => {
  const { get } = example(0, { doseAmount: "200" });
  pin(get("jw_jz"), "The documented vials do not cover the documented dose, so the expected modifier can't be determined.");
  assert.equal(get("jw_jz").summary, "the JW / JZ modifiers, because the documented vials do not cover the dose");
});

// --- Stage 4a part C: a description-only alteplase line can be Cathflo ---

const NOT_ACTIVASE =
  "ALTEPLASE without ACTIVASE, a labeled Activase strength (50 mg, 100 mg) or a labeled indication (Acute Ischemic Stroke): " +
  "can't be told apart from " +
  "Cathflo Activase (different product under J2997); use the NDC line type";

const notLabeled = (mg: string) =>
  `${mg} mg isn't a labeled Activase vial (50 mg, 100 mg): may be Cathflo Activase (different product under J2997); use the NDC line type`;

test("4c 'ALTEPLASE 2 MG VIAL (OR)' -> no match: 2 mg isn't a labeled Activase vial", () => {
  const m = desc("ALTEPLASE 2 MG VIAL (OR)");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, notLabeled("2"));
});

test("4c 'ALTEPLASE FOR ANGIOJET (OR)' (no brand, strength or indication) -> no match: can't be told apart", () => {
  const m = desc("ALTEPLASE FOR ANGIOJET (OR)");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, NOT_ACTIVASE);
});

test("4c 'ACTIVASE 2 MG' -> no match: a stated strength that isn't a labeled vial", () => {
  const m = desc("ACTIVASE 2 MG");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, notLabeled("2"));
});

test("4c 'ALTEPLASE FOR ACUTE STROKE PROTOCOL - BOLUS' -> J2997 MEDIUM (labeled indication)", () => {
  const m = desc("ALTEPLASE FOR ACUTE STROKE PROTOCOL - BOLUS");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates.length, 1);
  assert.equal(m.candidates[0].drugId, "J2997");
  assert.equal(m.candidates[0].confidence, "MEDIUM");
});

test("4c 'ACTIVASE 50 MG (1 MG/ML)' -> J2997 HIGH (the concentration is ignored)", () => {
  const m = desc("ACTIVASE 50 MG (1 MG/ML)");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates.length, 1);
  assert.equal(m.candidates[0].drugId, "J2997");
  assert.equal(m.candidates[0].confidence, "HIGH");
});

test("4c 'ALTEPLASE 100 MG INTRAVENOUS SOLUTION' -> still J2997 HIGH", () => {
  const m = desc("ALTEPLASE 100 MG INTRAVENOUS SOLUTION");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates.length, 1);
  assert.equal(m.candidates[0].drugId, "J2997");
  assert.equal(m.candidates[0].confidence, "HIGH");
});

test("4c 'HC ACTIVASE INJ' (brand named, no strength) -> still a J2997 candidate", () => {
  const m = desc("HC ACTIVASE INJ");
  assert.equal(m.status, "candidates");
  if (m.status !== "candidates") return;
  assert.equal(m.candidates[0].drugId, "J2997");
  assert.equal(m.candidates[0].confidence, "MEDIUM");
});

test("4c 'CATHFLO ACTIVASE 2 MG' keeps its existing reason", () => {
  const m = desc("CATHFLO ACTIVASE 2 MG");
  assert.equal(m.status, "no_match");
  assert.equal((m as { reason: string }).reason, "CATHFLO: excluded product");
});

test("4c hospital file: no description that carries a Cathflo NDC matches J2997", () => {
  let n = 0;
  for (const x of hospital.items.filter((i) => i.codes.some((c) => ["50242-0041-10", "50242-0041-64"].includes(c.code)))) {
    n++;
    assert.equal(desc(x.description).status, "no_match", x.description);
  }
  assert.ok(n >= 5, `only ${n} Cathflo-NDC rows found`);
});

// --- Stage 4a part D: a J2997 HCPCS line too small for any Activase vial may be Cathflo ---

const CATHFLO_GUARD = (billed: number) =>
  `${billed} units billed is less than the smallest Activase vial (50 mg), and no vials are documented, ` +
  "so this may be Cathflo Activase. No vial is assumed. Enter the vials used, or use the NDC line type.";
const smallJ2997 = (over: Partial<ClaimLine> = {}) => {
  const l = line({ hcpcs: "J2997", dose: { amount: 2, unit: "mg" }, unitsBilled: 2, jzReported: true, amountBilled: 100, ...over });
  return { ...check(l, "J2997"), line: l };
};
const strokeJ2997 = (over: Partial<ClaimLine> = {}) => {
  const l = line({
    hcpcs: "J2997", dose: { amount: 0.9, unit: "mg/kg" }, weightKg: 50, unitsBilled: 45, jwUnitsBilled: 0, amountBilled: 4500, ...over,
  });
  return { ...check(l, "J2997"), line: l };
};

test("4d J2997 HCPCS, 2 units, dose 2 mg, JZ, no vials: no JW flag, needs info with one reason", () => {
  const { get, results, line: l } = smallJ2997();
  assert.equal(get("dose").status, "info");
  assert.equal(get("benchmark").status, "info");
  assert.ok(!results.some((r) => r.status === "flag"), "no flag expected");
  pin(get("vials"), CATHFLO_GUARD(2));
  for (const id of ["units", "jw_jz", "dollars"] as const) {
    assert.equal(get(id).status, "needs_info");
    assert.equal(get(id).waitsOn, "vials");
    pin(get(id), `This check needs the vials. ${CATHFLO_GUARD(2)}`);
  }
  assert.equal(summarize({ line: l, results }),
    "No flags. 4 needs info: the vials, because 2 units billed is less than the smallest Activase vial (50 mg) " +
      "and none are documented; 3 checks wait on the vials.");
});

test("4d the same line with a 50 mg vial documented: the normal checks run", () => {
  const { get } = smallJ2997({ vialsUsed: [50] });
  assert.equal(get("vials").status, "pass");
  assert.equal(get("vials").values.drawn, 50);
  assert.equal(get("vials").values.waste, 48);
  assert.equal(get("jw_jz").status, "flag");
  assert.equal(get("jw_jz").summary, "JW expected but not billed");
});

test("4d J2997 0.9 mg/kg at 50 kg, 45 units, no JW, stroke indication: still flags JW expected", () => {
  const { get } = strokeJ2997({ indicationId: "acute_ischemic_stroke" });
  assert.equal(get("dose").values.doseAmount, 45);
  assert.deepEqual(get("vials").values.vials, [50]);
  assert.equal(get("vials").values.waste, 5);
  assert.equal(get("jw_jz").status, "flag");
  assert.equal(get("jw_jz").summary, "JW expected but not billed");
});

test("4d the same line with no indication: a mg/kg dose rules out Cathflo, so it still flags JW expected", () => {
  const { get } = strokeJ2997();
  assert.equal(get("dose").values.doseAmount, 45);
  assert.deepEqual(get("vials").values.vials, [50]);
  assert.equal(get("vials").values.waste, 5);
  assert.equal(get("jw_jz").status, "flag");
  assert.equal(get("jw_jz").summary, "JW expected but not billed");
});

test("4d flat 45 mg dose, 45 units, no JW, no indication, no vials: needs info (the accepted miss)", () => {
  const { get, results } = smallJ2997({ dose: { amount: 45, unit: "mg" }, unitsBilled: 45, jzReported: false, amountBilled: 4500 });
  assert.equal(get("dose").values.doseAmount, 45);
  pin(get("vials"), CATHFLO_GUARD(45));
  assert.equal(get("jw_jz").status, "needs_info");
  assert.equal(get("jw_jz").waitsOn, "vials");
  assert.ok(!results.some((r) => r.status === "flag"), "no flag expected");
});

test("4d the guard is J2997 only: a small J9312 line without vials still assumes a vial", () => {
  const { get } = check(line({ hcpcs: "J9312", dose: { amount: 100, unit: "mg" }, unitsBilled: 10, amountBilled: 100 }), "J9312");
  assert.equal(get("vials").status, "pass");
  assert.equal(get("vials").values.basis, "assumed: least-waste combination");
});

if (failed) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");
