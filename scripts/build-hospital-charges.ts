// Builds data/drug-line-review/hospital-charges.json from a hospital's CMS standard-charges CSV
// (kept outside the repo). Streams the file one record at a time; keeps only items whose codes
// include one of CODES.
//
// Usage:
//   npx --yes tsx scripts/build-hospital-charges.ts "<standard charges .csv>"
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { parseCsv } from "./build-drug-line-data";
import cms from "../data/drug-line-review/cms-asp-oct-2026.json";

const CODES = ["J0585", "J1745", "J2997", "J9035", "J9312"];
const OUT = path.join(__dirname, "..", "data", "drug-line-review", "hospital-charges.json");

// From the hospital's cms-hpt.txt (www.uofmhealth.org/cms-hpt.txt), as provided by the user.
// The download date is the date the file was saved to ~/Downloads/hpt/.
const SOURCE = {
  sourcePageUrl: "https://www.uofmhealth.org/michigan-medicine-standard-charges",
  mrfUrl: "https://www.uofmhealth.org/386006309_university-of-michigan-health_standardcharges4-1-2026.zip",
  downloadDate: "2026-10-27",
};

// Column names exactly as they appear in the CMS standard-charges CSV template (v3.0.0).
const COL = {
  billingClass: "billing_class",
  description: "description",
  modifiers: "modifiers",
  setting: "setting",
  drugUnitOfMeasurement: "drug_unit_of_measurement",
  drugTypeOfMeasurement: "drug_type_of_measurement",
  grossCharge: "standard_charge|gross",
};

type Item = {
  hcpcs: string;
  description: string;
  codes: { code: string; type: string }[];
  setting: string;
  billingClass: string;
  modifiers: string;
  grossCharge: number;
  drugUnitOfMeasurement: string;
  drugTypeOfMeasurement: string;
  unitBasis: "per HCPCS billing unit" | "per vial" | "per dose" | "unclear";
  unitBasisReason: string;
};

// Unit basis is set only when the file says so explicitly; anything else is "unclear".
export function unitBasis(
  description: string, drugUnit: string, drugType: string, cmsDosage: string,
): Pick<Item, "unitBasis" | "unitBasisReason"> {
  const per = /\bper\s*(\d+(?:\.\d+)?)?\s*(unit|mg)\b/i.exec(description); // "per Unit" reads as per 1 unit
  if (per) {
    const stated = `${per[1] ?? "1"} ${per[2].toUpperCase()}`;
    return stated === cmsDosage
      ? { unitBasis: "per HCPCS billing unit", unitBasisReason: `description says "${per[0]}", the CMS billing unit is ${cmsDosage}` }
      : { unitBasis: "unclear", unitBasisReason: `description says "${per[0]}", but the CMS billing unit is ${cmsDosage}` };
  }
  if (/\bper dose\b/i.test(description)) return { unitBasis: "per dose", unitBasisReason: 'description says "per dose"' };
  if (drugType === "UN" && drugUnit === "1" && /\bvial\b/i.test(description))
    return { unitBasis: "per vial", unitBasisReason: 'drug unit is 1 UN and the description names a vial' };
  const fields = drugUnit || drugType ? `drug unit ${drugUnit} ${drugType}` : "no drug unit fields";
  return { unitBasis: "unclear", unitBasisReason: `${fields}; the description states no basis` };
}

// Yields one parsed record at a time; a quoted field may span lines.
async function* records(file: string): AsyncGenerator<{ raw: string; parse: () => string[] }> {
  const lines = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  let buf = "";
  let quotes = 0;
  for await (const line of lines) {
    buf = buf ? `${buf}\n${line}` : line;
    for (const c of line) if (c === '"') quotes++;
    if (quotes % 2) continue;
    const raw = buf;
    yield { raw, parse: () => parseCsv(raw + "\n")[0] ?? [] };
    buf = "";
    quotes = 0;
  }
  if (buf) throw new Error("file ends inside a quoted field");
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx scripts/build-hospital-charges.ts <standard charges .csv>");
  const dosage = new Map(cms.codes.map((c) => [c.hcpcs, c.dosage]));

  const it = records(file);
  const next = async () => {
    const r = await it.next();
    if (r.done) throw new Error("file ended before the column header row");
    return r.value.parse();
  };
  // Rows 1-2: general data element names and values; row 3: column headers.
  const metaKeys = await next();
  const metaValues = await next();
  const meta = (k: string) => {
    const i = metaKeys.indexOf(k);
    if (i < 0) throw new Error(`metadata column "${k}" not found`);
    return metaValues[i];
  };
  const header = await next();
  if (header.includes("payer_name")) throw new Error("tall CSV format is not supported; this script reads the wide format");
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`column "${name}" not found`);
    return i;
  };
  const idx = Object.fromEntries(Object.entries(COL).map(([k, name]) => [k, col(name)])) as Record<keyof typeof COL, number>;
  const codeCols: [number, number][] = [];
  for (let n = 1; header.includes(`code|${n}`); n++) codeCols.push([col(`code|${n}`), col(`code|${n}|type`)]);

  const items: Item[] = [];
  for await (const rec of it) {
    if (!CODES.some((c) => rec.raw.includes(c))) continue;
    const row = rec.parse();
    const codes = codeCols.map(([c, t]) => ({ code: row[c] ?? "", type: row[t] ?? "" })).filter((x) => x.code);
    const hcpcs = codes.find((x) => CODES.includes(x.code))?.code;
    if (!hcpcs) continue;
    const drugUnit = row[idx.drugUnitOfMeasurement];
    const drugType = row[idx.drugTypeOfMeasurement];
    const gross = row[idx.grossCharge];
    if (gross.trim() === "" || Number.isNaN(Number(gross))) throw new Error(`no numeric gross charge: ${row[idx.description]}`);
    items.push({
      hcpcs,
      description: row[idx.description],
      codes,
      setting: row[idx.setting],
      billingClass: row[idx.billingClass],
      modifiers: row[idx.modifiers],
      grossCharge: Number(gross),
      drugUnitOfMeasurement: drugUnit,
      drugTypeOfMeasurement: drugType,
      ...unitBasis(row[idx.description], drugUnit, drugType, dosage.get(hcpcs)!),
    });
  }

  const key = (x: Item) => [x.hcpcs, x.description, x.setting, x.billingClass, x.modifiers, JSON.stringify(x.codes)].join("\u0000");
  items.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const out = {
    metadata: {
      hospital: meta("hospital_name"),
      locationName: meta("location_name"),
      hospitalAddress: meta("hospital_address"),
      lastUpdatedOn: meta("last_updated_on"), // as written in the file
      format: "CMS hospital price transparency standard charges CSV, wide",
      version: meta("version"),
      ...SOURCE,
      codes: CODES,
      codesNotFound: CODES.filter((c) => !items.some((x) => x.hcpcs === c)),
    },
    items,
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${items.length} items to ${path.relative(process.cwd(), OUT)}`);
}

if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
