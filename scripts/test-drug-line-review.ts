// Run with: npx tsx scripts/test-drug-line-review.ts
import assert from "node:assert/strict";
import { parseCsv, validateDrugs } from "./build-drug-line-data";

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

if (failed) {
  console.log(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nall tests passed");
