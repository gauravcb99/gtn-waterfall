// Builds data/drug-line-review/cms-asp-oct-2026.json from the CMS October 2026
// ASP files (kept outside the repo), then validates drugs.json if it exists.
//
// Usage:
//   npx --yes tsx scripts/build-drug-line-data.ts "<payment limit folder>" "<crosswalk folder>"
import fs from "node:fs";
import path from "node:path";

const CODES = ["J0585", "J1745", "J2997", "J9035", "J9312"];

const OUT_DIR = path.join(__dirname, "..", "data", "drug-line-review");
const CMS_OUT = path.join(OUT_DIR, "cms-asp-oct-2026.json");
const DRUGS = path.join(OUT_DIR, "drugs.json");
const SOURCES = path.join(OUT_DIR, "sources.json");

// Header text exactly as it appears in the CMS Section 508 CSVs.
const PAY_HEADER = {
  hcpcs: "HCPCS Code",
  shortDescription: "Short Description",
  dosage: "HCPCS Code Dosage",
  paymentLimit: "Payment Limit",
};
const XWALK_HEADER = {
  hcpcs: "_2026_CODE",
  shortDescription: "Short Description",
  labelerName: "LABELER NAME",
  ndc: "NDC",
  drugName: "Drug Name",
  dosage: "HCPCS dosage",
  pkgSize: "PKG SIZE",
  pkgQty: "PKG QTY",
  billUnits: "BILLUNITS",
  billUnitsPkg: "BILLUNITSPKG",
};

// Minimal RFC 4180 parser: quoted fields may contain commas, newlines and "" escapes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Cms = { codes: { hcpcs: string; shortDescription: string; dosage: string }[] };
type Sources = { sources: { id: string }[] };

// Returns a list of problems; empty means drugs.json is valid.
export function validateDrugs(drugsJson: unknown, cms: Cms, sources: Sources): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(sources.sources.map((s) => s.id));
  const nonEmpty = (v: unknown) => typeof v === "string" && v.trim() !== "";

  const isCited = (n: unknown): n is { value: unknown; cite: Record<string, unknown> } =>
    typeof n === "object" && n !== null && !Array.isArray(n) && "value" in n && "cite" in n;

  function walk(node: unknown, at: string) {
    if (isCited(node)) {
      const c = node.cite;
      if (node.value === undefined || node.value === null) errors.push(`${at}: empty value`);
      if (typeof c !== "object" || c === null) return void errors.push(`${at}: cite is not an object`);
      if (!nonEmpty(c.source) || !sourceIds.has(c.source as string))
        errors.push(`${at}: cite.source "${c.source}" is not in sources.json`);
      if (!nonEmpty(c.setid) && !nonEmpty(c.file)) errors.push(`${at}: cite needs setid or file`);
      if (!nonEmpty(c.section)) errors.push(`${at}: cite.section is empty`);
      if (!nonEmpty(c.quote)) errors.push(`${at}: cite.quote is empty`);
    } else if (Array.isArray(node)) {
      node.forEach((n, i) => walk(n, `${at}[${i}]`));
    } else if (typeof node === "object" && node !== null) {
      for (const [k, v] of Object.entries(node)) walk(v, `${at}.${k}`);
    } else {
      errors.push(`${at}: uncited value ${JSON.stringify(node)}`);
    }
  }

  const drugs = (drugsJson as { drugs?: Record<string, any>[] }).drugs;
  if (!Array.isArray(drugs)) return ["drugs.json: missing drugs array"];

  for (const d of drugs) {
    const at = `drug ${d.id}`;
    for (const [k, v] of Object.entries(d)) if (k !== "id") walk(v, `${at}.${k}`);

    const code = cms.codes.find((c) => c.hcpcs === d.hcpcs?.value);
    if (!code) {
      errors.push(`${at}: HCPCS ${d.hcpcs?.value} not found in CMS data`);
      continue;
    }
    if (d.id !== code.hcpcs) errors.push(`${at}: id does not match hcpcs ${code.hcpcs}`);
    if (d.hcpcsDescriptor?.value !== code.shortDescription)
      errors.push(`${at}: descriptor "${d.hcpcsDescriptor?.value}" != CMS "${code.shortDescription}"`);
    if (d.billingUnitRaw?.value !== code.dosage)
      errors.push(`${at}: billingUnitRaw "${d.billingUnitRaw?.value}" != CMS "${code.dosage}"`);
    const bu = d.billingUnit?.value;
    if (`${bu?.amount} ${bu?.unit}` !== code.dosage)
      errors.push(`${at}: billingUnit ${JSON.stringify(bu)} != CMS "${code.dosage}"`);
  }
  for (const c of cms.codes)
    if (drugs.filter((d) => d.hcpcs?.value === c.hcpcs).length !== 1)
      errors.push(`CMS code ${c.hcpcs}: expected exactly one drug in drugs.json`);
  return errors;
}

function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function findOneFile(folder: string, pattern: RegExp): string {
  if (!fs.existsSync(folder)) fail(`folder not found: ${folder}`);
  const hits = fs.readdirSync(folder).filter((f) => pattern.test(f));
  if (hits.length !== 1) fail(`expected one file matching ${pattern} in ${folder}, found ${hits.length}`);
  return hits[0];
}

// Finds the header row by its exact first cell and maps each wanted column to its index.
function readTable<K extends string>(file: string, header: Record<K, string>) {
  // The CMS CSVs are single-byte encoded (e.g. 0xA0 non-breaking spaces), not UTF-8.
  const rows = parseCsv(fs.readFileSync(file, "latin1"));
  const first = Object.values<string>(header)[0];
  const h = rows.findIndex((r) => r[0] === first);
  if (h < 0) fail(`header row starting "${first}" not found in ${file}`);
  const idx = {} as Record<K, number>;
  for (const [k, name] of Object.entries<string>(header)) {
    const i = rows[h].indexOf(name);
    if (i < 0) fail(`column "${name}" not found in ${file}`);
    idx[k as K] = i;
  }
  const data = rows.slice(h + 1).filter((r) => r.some((c) => c !== ""));
  return { headerRow: rows[h], dataRowCount: data.length, rows: data, idx };
}

function num(s: string, what: string): number {
  const n = Number(s);
  if (s.trim() === "" || !Number.isFinite(n)) fail(`not a number for ${what}: "${s}"`);
  return n;
}

function main() {
  const [payDir, xwalkDir] = process.argv.slice(2);
  if (!payDir || !xwalkDir) fail("usage: build-drug-line-data.ts <payment limit folder> <crosswalk folder>");

  const payFile = findOneFile(payDir, /^section 508 version of .*Medicare Part B Payment Limit File.*\.csv$/i);
  const xwalkFile = findOneFile(xwalkDir, /^section 508 version of .*ASP NDC-HCPCS Crosswalk.*\.csv$/i);
  const pay = readTable(path.join(payDir, payFile), PAY_HEADER);
  const xw = readTable(path.join(xwalkDir, xwalkFile), XWALK_HEADER);

  const codes = CODES.map((code) => {
    const hits = pay.rows.filter((r) => r[pay.idx.hcpcs] === code);
    if (hits.length !== 1) fail(`${code}: expected 1 row in payment limit file, found ${hits.length}`);
    const r = hits[0];
    return {
      hcpcs: code,
      shortDescription: r[pay.idx.shortDescription],
      dosage: r[pay.idx.dosage],
      paymentLimit: num(r[pay.idx.paymentLimit], `${code} payment limit`),
    };
  });

  const crosswalk = xw.rows
    .filter((r) => CODES.includes(r[xw.idx.hcpcs]))
    .map((r) => ({
      hcpcs: r[xw.idx.hcpcs],
      shortDescription: r[xw.idx.shortDescription],
      labelerName: r[xw.idx.labelerName],
      ndc: r[xw.idx.ndc],
      drugName: r[xw.idx.drugName],
      dosage: r[xw.idx.dosage],
      pkgSize: num(r[xw.idx.pkgSize], "PKG SIZE"),
      pkgQty: num(r[xw.idx.pkgQty], "PKG QTY"),
      billUnitsPerItem: num(r[xw.idx.billUnits], "BILLUNITS"),
      billUnitsPerNdc: num(r[xw.idx.billUnitsPkg], "BILLUNITSPKG"),
    }))
    .sort((a, b) => a.hcpcs.localeCompare(b.hcpcs) || a.ndc.localeCompare(b.ndc));
  for (const c of CODES) if (!crosswalk.some((r) => r.hcpcs === c)) fail(`${c}: no crosswalk rows`);

  const out = {
    metadata: {
      quarter: "October 2026",
      effective: "October 1, 2026 through December 31, 2026",
      fileDate: "091626",
      cmsPageStatus: "Final, 09/17/2026",
      downloadDate: "2026-10-23",
      sourceUrl: "https://www.cms.gov/medicare/payment/part-b-drugs/asp-pricing-files",
      paymentLimitFile: {
        folder: path.basename(payDir),
        file: payFile,
        headerRow: pay.headerRow,
        dataRowCount: pay.dataRowCount,
        columnsUsed: PAY_HEADER,
      },
      crosswalkFile: {
        folder: path.basename(xwalkDir),
        file: xwalkFile,
        headerRow: xw.headerRow,
        dataRowCount: xw.dataRowCount,
        columnsUsed: XWALK_HEADER,
        // From "section 508 version of NDC-HCPCS Crosswalk Introduction Text 090326.csv".
        columnMeanings: {
          pkgSize: "PKG SIZE = Package Size: amount in one item",
          pkgQty: "PKG QTY = Package Quantity: number of items in the NDC",
          billUnitsPerItem: "BILLUNITS = Billable Units Per Package (one item)",
          billUnitsPerNdc: "BILLUNITSPKG = Billable Units Per 11-Digit NDC",
        },
      },
    },
    codes,
    crosswalk,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(CMS_OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${path.relative(process.cwd(), CMS_OUT)}: ${codes.length} codes, ${crosswalk.length} crosswalk rows`);
  for (const c of codes) console.log(`  ${c.hcpcs}  ${c.dosage.padEnd(7)} $${c.paymentLimit}  ${c.shortDescription}`);

  if (!fs.existsSync(DRUGS)) {
    console.log("drugs.json not found: validation skipped");
    return;
  }
  if (!fs.existsSync(SOURCES)) fail("drugs.json exists but sources.json does not");
  const errors = validateDrugs(
    JSON.parse(fs.readFileSync(DRUGS, "utf8")),
    out,
    JSON.parse(fs.readFileSync(SOURCES, "utf8")),
  );
  if (errors.length) {
    for (const e of errors) console.error(`INVALID ${e}`);
    fail(`drugs.json validation failed with ${errors.length} problem(s)`);
  }
  console.log("drugs.json validation passed");
}

if (require.main === module) main();
