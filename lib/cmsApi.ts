// CMS drug pricing data — fetched via the /api/drug-search proxy route
// (direct browser → CMS calls are blocked by CORS; the proxy runs server-side)

// ─── Types ────────────────────────────────────────────────────────────────────

// Shape returned by /api/drug-search
interface ProxyDrugResult {
  drugName: string;
  ndc: string;
  wacPerUnit: number | null;
  asOfDate: string | null;
  drugType?: string;
}

interface ProxyResponse {
  source: string;
  results: ProxyDrugResult[];
  message?: string;
  error?: string;
}

// Shape consumed by InputForm
export interface CMSDrugData {
  drugName: string;
  ndc: string;
  wacPerUnit: number;
  asOfDate: string;
  dataSources: string[];
  medicarePartDVolume?: number; // quarterly estimate — populated when Medicare Part D data is available
  medicareDataAvailable: boolean;
}

export interface CMSSearchResult {
  results: CMSDrugData[];
  error?: string;
  medicareError?: string; // non-fatal note when Medicare Part D data is unavailable
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Search for a drug by name or NDC through the Next.js proxy route.
 * The proxy handles all external CMS/FDA fetches server-side, avoiding CORS.
 */
export async function searchDrug(name: string): Promise<ProxyResponse> {
  const response = await fetch(
    `/api/drug-search?name=${encodeURIComponent(name)}`,
    { signal: AbortSignal.timeout(20000) }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ??
        "CMS data temporarily unavailable. Please enter data manually."
    );
  }

  return response.json() as Promise<ProxyResponse>;
}

/**
 * High-level search used by InputForm.
 * Returns de-duplicated CMSDrugData records ready for field population.
 */
export async function searchCMSDrug(searchTerm: string): Promise<CMSSearchResult> {
  let proxy: ProxyResponse;

  try {
    proxy = await searchDrug(searchTerm);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "CMS data temporarily unavailable. Please enter data manually.";
    throw new Error(msg);
  }

  // Proxy reported no results
  if (!proxy.results || proxy.results.length === 0) {
    return {
      results: [],
      error:
        proxy.message ??
        "No NADAC data found for this drug. Try a different search term or enter data manually.",
    };
  }

  // De-duplicate by NDC and normalise into CMSDrugData
  const seen = new Set<string>();
  const results: CMSDrugData[] = [];

  for (const r of proxy.results) {
    const key = r.ndc || r.drugName;
    if (seen.has(key)) continue;
    seen.add(key);

    results.push({
      drugName: toTitleCase(r.drugName),
      ndc: r.ndc,
      wacPerUnit: r.wacPerUnit ?? 0,
      asOfDate: r.asOfDate ?? "",
      // OpenFDA fallback has no pricing — reflect that in the source label
      dataSources: r.wacPerUnit != null ? ["NADAC"] : ["OpenFDA"],
      medicareDataAvailable: false,
    });
  }

  return { results };
}
