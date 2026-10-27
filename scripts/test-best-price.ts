// Tests for the Best Price fixes. Run: npx tsx scripts/test-best-price.ts
import assert from "node:assert/strict";
import { calculate, type InputValues } from "../lib/calculations";

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

// app/page.tsx DEFAULT_INPUTS
const DEFAULTS: InputValues = {
  drugName: "Sample Drug", wac: 1000, ampPercentage: 95, currentBestPrice: 730, commercialRebatePercentage: 35,
  commercialVolume: 50000, medicaidVolume: 10000, volume340B: 5000,
};
const pbm = (over: Partial<InputValues> = {}) => calculate({ ...DEFAULTS, concessionRecipient: "pbm_formulary", ...over });
const cents = (n: number) => Math.round(n * 100) / 100;

// Same sweep as components/SensitivityAnalysis.tsx: safe ceiling = last rebate before the first trigger.
function safeCeiling(inputs: InputValues) {
  for (let rebate = 0; rebate <= 80; rebate++)
    if (calculate({ ...inputs, commercialRebatePercentage: rebate }).bestPriceTriggered) return rebate - 1;
  return 80;
}

// --- Change 1: who receives the concession ---

test("1 defaults with (a): reference outputs unchanged, and (a) explicit equals (a) by default", () => {
  const r = calculate(DEFAULTS);
  assert.equal(r.incrementalMedicaidExposure, 800000);
  assert.equal(r.gtnSpreadPercentage.toFixed(1), "34.2");
  assert.equal(safeCeiling(DEFAULTS), 27);
  assert.deepEqual(calculate({ ...DEFAULTS, concessionRecipient: "bp_eligible" }), r);
});

test("2 defaults with (b) at 35%: Best Price $730, URA $220, exposure $0, 340B ceiling $730, net $43,950,000, GTN 32.4%", () => {
  const r = pbm();
  assert.equal(r.bestPriceTriggered, false);
  assert.equal(r.newBestPrice, 730);
  assert.equal(cents(r.newMedicaidRebatePerUnit), 220);
  assert.equal(r.incrementalMedicaidExposure, 0);
  assert.equal(cents(r.price340B), 730);
  // $65,000,000 gross - $17,500,000 commercial - $2,200,000 Medicaid - $1,350,000 340B
  assert.equal(r.totalGrossRevenue, 65_000_000);
  assert.equal(cents(r.commercialRebateTotal), 17_500_000);
  assert.equal(cents(r.medicaidRebateTotal), 2_200_000);
  assert.equal(cents(r.totalDiscount340B), 1_350_000);
  assert.equal(cents(r.totalNetRevenue), 43_950_000);
  assert.equal(r.gtnSpreadPercentage.toFixed(1), "32.4");
});

test("3 (b) at 80%: same Best Price, URA and exposure as test 2", () => {
  const r = pbm({ commercialRebatePercentage: 80 });
  assert.equal(r.bestPriceTriggered, false);
  assert.equal(r.newBestPrice, 730);
  assert.equal(cents(r.newMedicaidRebatePerUnit), 220);
  assert.equal(r.incrementalMedicaidExposure, 0);
});

test("(b) sweep: no rebate from 0% to 80% triggers Best Price, exposure stays $0", () => {
  for (let rebate = 0; rebate <= 80; rebate++) {
    const r = pbm({ commercialRebatePercentage: rebate });
    assert.equal(r.bestPriceTriggered, false, `${rebate}%`);
    assert.equal(r.incrementalMedicaidExposure, 0, `${rebate}%`);
  }
});

if (failed) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");
