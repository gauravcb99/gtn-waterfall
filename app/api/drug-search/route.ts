import { NextRequest, NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrugResult {
  drugName: string;
  ndc: string;
  wacPerUnit: number | null;
  asOfDate: string | null;
  drugType?: string;
}

interface RouteResponse {
  source: string;
  results: DrugResult[];
  message?: string;
  error?: string;
}

type NADACRow = Record<string, string | null>;
type FDAResult = { openfda?: { brand_name?: string[]; product_ndc?: string[] } };

// ─── NADAC helper ─────────────────────────────────────────────────────────────

async function fetchNADAC(searchValue: string): Promise<DrugResult[]> {
  // NADAC descriptions are stored in uppercase; the LIKE is case-sensitive
  const upper = searchValue.toUpperCase();
  const url =
    `https://data.medicaid.gov/api/1/datastore/query/f38d0706-1239-442c-a3cc-40ef1b686ac0/0` +
    `?conditions[0][property]=ndc_description` +
    `&conditions[0][value]=${encodeURIComponent("%" + upper + "%")}` +
    `&conditions[0][operator]=LIKE` +
    `&limit=10` +
    `&sort[0][property]=as_of_date` +
    `&sort[0][direction]=desc`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data.results) || data.results.length === 0) return [];

  return data.results.map((r: NADACRow) => ({
    drugName: r.ndc_description ?? "",
    ndc: r.ndc ?? "",
    wacPerUnit: r.nadac_per_unit != null ? parseFloat(r.nadac_per_unit) : null,
    asOfDate: r.as_of_date ?? null,
    drugType: r.classification_for_rate_setting ?? undefined,
  }));
}

// ─── OpenFDA brand-name lookup ────────────────────────────────────────────────

/**
 * Ask OpenFDA for brand names associated with a generic INN.
 * Returns up to 3 brand names (uppercase) to retry against NADAC.
 */
async function getBrandNamesFromFDA(genericName: string): Promise<string[]> {
  const url =
    `https://api.fda.gov/drug/label.json` +
    `?search=openfda.generic_name:"${encodeURIComponent(genericName)}"` +
    `&limit=5`;

  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];

  const data = await res.json();
  const brands = new Set<string>();
  for (const r of data.results ?? []) {
    const names: string[] = (r as FDAResult).openfda?.brand_name ?? [];
    for (const n of names) brands.add(n.toUpperCase());
    if (brands.size >= 3) break;
  }
  return Array.from(brands);
}

// ─── OpenFDA fallback (no NADAC pricing available) ───────────────────────────

async function fetchFDAFallback(name: string): Promise<DrugResult[]> {
  const url =
    `https://api.fda.gov/drug/label.json` +
    `?search=openfda.brand_name:"${encodeURIComponent(name)}"` +
    `&limit=5`;

  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];

  const data = await res.json();
  if (!Array.isArray(data.results) || data.results.length === 0) return [];

  return data.results.map((r: FDAResult) => ({
    drugName: r.openfda?.brand_name?.[0] ?? name,
    ndc: r.openfda?.product_ndc?.[0] ?? "",
    wacPerUnit: null,
    asOfDate: null,
    drugType: "brand",
  }));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");

  if (!name?.trim()) {
    return NextResponse.json({ error: "Drug name required" }, { status: 400 });
  }

  const term = name.trim();

  try {
    // ── Pass 1: search NADAC by the term as typed ────────────────────────────
    let results = await fetchNADAC(term);

    // ── Pass 2: if nothing came back, try brand-name resolution via OpenFDA ──
    // e.g. "semaglutide" → ["OZEMPIC", "WEGOVY", "RYBELSUS"] → retry NADAC
    if (results.length === 0) {
      const brandNames = await getBrandNamesFromFDA(term);
      for (const brand of brandNames) {
        results = await fetchNADAC(brand);
        if (results.length > 0) break;
      }
    }

    if (results.length > 0) {
      return NextResponse.json<RouteResponse>({ source: "NADAC", results });
    }

    // ── Pass 3: OpenFDA name-only fallback (no pricing) ──────────────────────
    const fdaResults = await fetchFDAFallback(term);
    if (fdaResults.length > 0) {
      return NextResponse.json<RouteResponse>({
        source: "OpenFDA",
        results: fdaResults,
      });
    }

    return NextResponse.json<RouteResponse>({
      source: "none",
      results: [],
      message: "No data found for this drug",
    });
  } catch (error) {
    console.error("[drug-search] upstream fetch failed:", error);
    return NextResponse.json<RouteResponse>(
      { source: "error", results: [], error: "Failed to fetch drug data" },
      { status: 500 }
    );
  }
}
