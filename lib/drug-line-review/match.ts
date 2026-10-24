import { cms, drugs, findDrug, measure } from "./data";
import type { ClaimLine, MatchCandidate, MatchResult } from "./types";

// Identifies candidate drugs only. Checks run later, on a drug id the user confirmed.
export function matchLine(line: Pick<ClaimLine, "lineType" | "description" | "hcpcs" | "ndc">): MatchResult {
  if (line.lineType === "rev0636_hcpcs") return matchHcpcs(line.hcpcs);
  if (line.lineType === "ndc_only") return matchNdc(line.ndc);
  return matchDescription(line.description);
}

function matchHcpcs(hcpcs: string | undefined): MatchResult {
  if (!hcpcs?.trim()) return { status: "needs_info", reason: "HCPCS code missing" };
  const code = hcpcs.trim().toUpperCase();
  const drug = findDrug(code);
  if (!drug) return { status: "no_match", reason: `HCPCS ${code} is not in the library` };
  return { status: "candidates", candidates: [{ drugId: drug.id }] };
}

// Returns the 11-digit NDC, or a reason it cannot be normalized.
export function normalizeNdc(ndc: string): { ndc11: string } | { reason: string } {
  const raw = ndc.trim();
  if (raw.includes("-")) {
    const parts = raw.split("-");
    const max = [5, 4, 2];
    if (parts.length !== 3 || parts.some((p, i) => !/^\d+$/.test(p) || p.length > max[i]))
      return { reason: `unrecognized NDC format "${raw}"` };
    return { ndc11: parts.map((p, i) => p.padStart(max[i], "0")).join("") };
  }
  if (/^\d{11}$/.test(raw)) return { ndc11: raw };
  if (/^\d{10}$/.test(raw))
    return { reason: "10-digit NDC without hyphens is ambiguous; enter the hyphenated NDC" };
  return { reason: `unrecognized NDC format "${raw}"` };
}

// Crosswalk drug names (uppercased) that share a library HCPCS code but are not the library product.
// A test asserts each name still exists in the crosswalk JSON.
export const EXCLUDED_PRODUCTS: Record<string, string> = {
  "CATHFLO ACTIVASE": "excluded product: Cathflo Activase (different product under J2997)",
  "BOTOX COSMETIC": "excluded product: BOTOX Cosmetic (cosmetic product, not in library)",
};

function matchNdc(ndc: string | undefined): MatchResult {
  if (!ndc?.trim()) return { status: "needs_info", reason: "NDC missing" };
  const n = normalizeNdc(ndc);
  if ("reason" in n) return { status: "needs_info", reason: n.reason };
  const rows = cms.crosswalk.filter((r) => r.ndc.replace(/-/g, "") === n.ndc11 && findDrug(r.hcpcs));
  if (!rows.length) return { status: "no_match", reason: `NDC ${n.ndc11} is not in the CMS crosswalk for the library` };
  for (const r of rows) {
    const reason = EXCLUDED_PRODUCTS[r.drugName.trim().toUpperCase()];
    if (reason) return { status: "no_match", reason };
  }
  const candidates: MatchCandidate[] = rows.map((r) => ({
    drugId: r.hcpcs,
    normalizedNdc: n.ndc11,
    crosswalkDrugName: r.drugName,
  }));
  return { status: "candidates", candidates };
}

function tokenize(upper: string): string[] {
  return upper
    .replace(/(\d)([A-Z])/g, "$1 $2") // "100MG" -> "100 MG"
    .replace(/[^A-Z0-9.]+/g, " ")
    .split(" ")
    .map((t) => (/^\d+\.\d+$/.test(t) ? t : t.replace(/\./g, ""))) // keep decimal points only
    .filter(Boolean);
}

function matchDescription(description: string): MatchResult {
  if (!description.trim()) return { status: "needs_info", reason: "description missing" };
  const upper = description.toUpperCase();

  // Exclusions are checked on the raw text, before punctuation is stripped.
  if (/\bCATHFLO\b/.test(upper)) return { status: "no_match", reason: "CATHFLO: excluded product" };
  for (const d of drugs) {
    const generic = d.genericName.value.toUpperCase();
    if (new RegExp(`\\b${generic}\\s*-\\s*[A-Z]{4}\\b`).test(upper))
      return { status: "no_match", reason: `${generic} with a suffix: biosimilar, different HCPCS, not in library` };
  }
  const tokens = tokenize(upper);
  if (tokens.includes("BOTOX") && tokens.includes("COSMETIC"))
    return { status: "no_match", reason: EXCLUDED_PRODUCTS["BOTOX COSMETIC"] };
  const toxinAt = tokens.findIndex((t, i) => t === "BOTULINUM" && tokens[i + 1] === "TOXIN");
  if (toxinAt >= 0 && !tokens.some((t) => ["ONA", "ONABOTULINUMTOXINA", "BOTOX"].includes(t)))
    return { status: "no_match", reason: "BOTULINUM TOXIN without ONA/ONABOTULINUMTOXINA/BOTOX: ambiguous across products" };

  const candidates: MatchCandidate[] = [];
  for (const d of drugs) {
    const names = [d.genericName.value, ...d.brandAliases.value].map((n) => n.toUpperCase());
    const nameTokens = tokens.filter((t) => names.includes(t));
    if (!nameTokens.length) {
      // Abbreviated onabotulinumtoxinA: MEDIUM only, never HIGH.
      if (!names[0].startsWith("ONABOTULINUM")) continue;
      const abbrev = tokens.includes("ONABOTULINUM")
        ? ["ONABOTULINUM"]
        : tokens.includes("ONA") && tokens.includes("BOTULINUM")
          ? ["ONA", "BOTULINUM"]
          : [];
      if (abbrev.length) candidates.push({ drugId: d.id, confidence: "MEDIUM", matchedTokens: abbrev });
      continue;
    }
    const strength = tokens.findIndex(
      (t, i) =>
        /^\d+(\.\d+)?$/.test(t) &&
        i + 1 < tokens.length &&
        d.vialSizes.some((v) => v.value.amount === Number(t) && measure(v.value.unit) === measure(tokens[i + 1])),
    );
    candidates.push(
      strength >= 0
        ? { drugId: d.id, confidence: "HIGH", matchedTokens: [...nameTokens, tokens[strength], tokens[strength + 1]] }
        : { drugId: d.id, confidence: "MEDIUM", matchedTokens: nameTokens },
    );
  }
  if (!candidates.length) return { status: "no_match", reason: "nothing matches the library" };
  return { status: "candidates", candidates };
}
