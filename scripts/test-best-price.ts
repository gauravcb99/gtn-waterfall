// Tests for the Best Price fixes. Run: npx tsx scripts/test-best-price.ts
import assert from "node:assert/strict";
import { calculate, calculateIRABestPriceEffect, calculateIRAImpact, type InputValues } from "../lib/calculations";

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

// --- Change 2, Design A: Best Price effect of the negotiated price ---

// IRA module defaults (components/IRAImpactScenario.tsx): 10 years, price year 2028, Part D 15,000 units,
// Part D rebate 20%, catastrophic 20%; Non-Federal AMP follows the core AMP.
type IRAOver = { yearsOnMarket?: number; ipay?: number; medicarePartDRebatePct?: number };
function effect(core: Partial<InputValues> = {}, ira: IRAOver = {}) {
  const inputs = { ...DEFAULTS, ...core };
  const r = calculate(inputs);
  const i = calculateIRAImpact(
    { yearsOnMarket: 10, ipay: 2028, nonFederalAMP: r.amp, medicarePartDVolume: 15000, medicarePartDRebatePct: 20, catastrophicDiscountPct: 20, ...ira },
    inputs.wac, r.totalNetRevenue,
  );
  return { r, i, e: calculateIRABestPriceEffect(r, inputs, i.iraNegotiatedPrice) };
}
// Hand computation from the Design A table, independent of the library: AMP $950, floor 23.1% of AMP.
function byHand(bpBase: number, iraPrice: number, medicaidUnits = 10000, units340B = 5000) {
  const amp = 950;
  const uraBase = Math.max(0.231 * amp, amp - bpBase);
  const uraWithIRA = Math.max(0.231 * amp, amp - Math.min(bpBase, iraPrice));
  const medicaid = (uraWithIRA - uraBase) * medicaidUnits;
  const b340 = (uraWithIRA - uraBase) * units340B;
  return { uraBase: cents(uraBase), uraWithIRA: cents(uraWithIRA), medicaid: cents(medicaid), b340: cents(b340), total: cents(medicaid + b340) };
}
function expectEffect(
  e: ReturnType<typeof calculateIRABestPriceEffect>,
  want: { bpBase: number; bpWithIRA: number; uraBase: number; uraWithIRA: number; medicaid: number; b340: number; total: number },
) {
  const hand = byHand(want.bpBase, want.bpWithIRA);
  assert.deepEqual(hand, { uraBase: want.uraBase, uraWithIRA: want.uraWithIRA, medicaid: want.medicaid, b340: want.b340, total: want.total },
    "hand computation disagrees with the doc");
  assert.equal(cents(e.bpBase), want.bpBase);
  assert.equal(cents(e.bpWithIRA), want.bpWithIRA);
  assert.equal(cents(e.uraBase), want.uraBase);
  assert.equal(cents(e.uraWithIRA), want.uraWithIRA);
  assert.equal(cents(e.medicaidAddOn), want.medicaid);
  assert.equal(cents(e.addOn340B), want.b340);
  assert.equal(cents(e.totalAddOn), want.total);
}

test("C2-1 defaults at 35%: IRA price $712.50, BP base $650 is below it, add-on $0; reference outputs unchanged", () => {
  const { r, i, e } = effect();
  assert.equal(i.iraNegotiatedPrice, 712.5);
  expectEffect(e, { bpBase: 650, bpWithIRA: 650, uraBase: 300, uraWithIRA: 300, medicaid: 0, b340: 0, total: 0 });
  assert.equal(e.zeroReason, "deal_below_negotiated_price");
  assert.equal(r.incrementalMedicaidExposure, 800000);
  assert.equal(r.gtnSpreadPercentage.toFixed(1), "34.2");
  assert.equal(safeCeiling(DEFAULTS), 27);
  assert.equal(i.totalIRAImpact, 1633125);
});

test("C2-2 27% rebate: BP $730 to $712.50, URA $220 to $237.50, Medicaid +$175,000, 340B +$87,500, total $262,500", () => {
  const { e } = effect({ commercialRebatePercentage: 27 });
  expectEffect(e, { bpBase: 730, bpWithIRA: 712.5, uraBase: 220, uraWithIRA: 237.5, medicaid: 175000, b340: 87500, total: 262500 });
  assert.equal(e.zeroReason, null);
});

test("C2-3 0% rebate: same as test 2, $262,500", () => {
  const { e } = effect({ commercialRebatePercentage: 0 });
  expectEffect(e, { bpBase: 730, bpWithIRA: 712.5, uraBase: 220, uraWithIRA: 237.5, medicaid: 175000, b340: 87500, total: 262500 });
});

test("C2-4 16+ years (40%), 35% rebate: IRA price min(0.40 x 950, 800) = $380, URA $300 to $570, total $4,050,000", () => {
  const { i, e } = effect({}, { yearsOnMarket: 16 });
  assert.equal(i.iraNegotiatedPrice, Math.min(0.4 * 950, 800));
  assert.equal(i.iraNegotiatedPrice, 380);
  expectEffect(e, { bpBase: 650, bpWithIRA: 380, uraBase: 300, uraWithIRA: 570, medicaid: 2700000, b340: 1350000, total: 4050000 });
});

test("C2-5 12 to 15 years, price year 2030 (65%), 35% rebate: IRA price $617.50, URA $300 to $332.50, total $487,500", () => {
  const { i, e } = effect({}, { yearsOnMarket: 12, ipay: 2030 });
  assert.equal(i.iraNegotiatedPrice, 617.5);
  expectEffect(e, { bpBase: 650, bpWithIRA: 617.5, uraBase: 300, uraWithIRA: 332.5, medicaid: 325000, b340: 162500, total: 487500 });
});

test("C2-6 floor case, current Best Price $850, 0% rebate: URA base max(219.45, 100) = $219.45 to $237.50, total $270,750", () => {
  const { e } = effect({ currentBestPrice: 850, commercialRebatePercentage: 0 });
  expectEffect(e, { bpBase: 850, bpWithIRA: 712.5, uraBase: 219.45, uraWithIRA: 237.5, medicaid: 180500, b340: 90250, total: 270750 });
});

test("C2-7 Part D rebate 30%, 27% rebate: IRA price min(712.50, 700) = $700, URA $220 to $250, total $450,000", () => {
  const { i, e } = effect({ commercialRebatePercentage: 27 }, { medicarePartDRebatePct: 30 });
  assert.equal(i.iraNegotiatedPrice, Math.min(712.5, 700));
  expectEffect(e, { bpBase: 730, bpWithIRA: 700, uraBase: 220, uraWithIRA: 250, medicaid: 300000, b340: 150000, total: 450000 });
});

test("C2-(b) PBM formulary rebate at 35%: BP base is the current $730, so the add-on is $262,500", () => {
  const { e } = effect({ concessionRecipient: "pbm_formulary" });
  expectEffect(e, { bpBase: 730, bpWithIRA: 712.5, uraBase: 220, uraWithIRA: 237.5, medicaid: 175000, b340: 87500, total: 262500 });
});

test("C2 zero reason: negotiated price above a Best Price the deal did not set", () => {
  const { e } = effect({ currentBestPrice: 700, commercialRebatePercentage: 0 });
  assert.equal(e.totalAddOn, 0);
  assert.equal(e.zeroReason, "negotiated_price_above_best_price");
});

test("C2 zero reason: the 23.1% minimum rebate applies with or without the negotiated price", () => {
  // Best Price $850, IRA price $800: URA = max(219.45, 950 - 850) = max(219.45, 950 - 800) = $219.45 both ways
  const inputs = { ...DEFAULTS, currentBestPrice: 850, commercialRebatePercentage: 0 };
  const e = calculateIRABestPriceEffect(calculate(inputs), inputs, 800);
  assert.equal(cents(e.uraBase), 219.45);
  assert.equal(cents(e.uraWithIRA), 219.45);
  assert.equal(e.totalAddOn, 0);
  assert.equal(e.zeroReason, "minimum_rebate_applies");
});

if (failed) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");
