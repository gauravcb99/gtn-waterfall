import sourcesJson from "@/data/drug-line-review/sources.json";

export type Source = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  version: string;
  downloadDate: string;
  quarter?: string;
  effective?: string;
  file?: string;
  setid?: string;
};

export const sources = sourcesJson.sources as Source[];

export function sourceById(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

// DailyMed titles end with the labeler in brackets; the page names no company, so drop it for display.
export function displayTitle(s: Source): string {
  return s.title.replace(/\s*\[[^\]]*\]\s*$/, "");
}
