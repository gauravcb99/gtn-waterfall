"use client";

import type { CheckResult, CheckStatus, Citation } from "@/lib/drug-line-review/types";
import { TITLES, type Display } from "./display";
import { displayTitle, sourceById } from "./sources";

const CHIPS: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "pass", className: "bg-emerald-50 text-emerald-700" },
  flag: { label: "flag", className: "bg-red-50 text-red-700" },
  advisory: { label: "advisory", className: "bg-amber-50 text-amber-700" },
  needs_info: { label: "needs info", className: "bg-gray-100 text-gray-700" },
  info: { label: "info", className: "bg-[#E8F5F5] text-[#0A4747]" },
  not_applicable: { label: "not applicable", className: "bg-gray-50 text-gray-500" },
};

// Each distinct citation once per card.
function distinct(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  return citations.filter((c) => {
    const key = JSON.stringify([c.source, c.setid, c.file, c.section, c.quote]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ResultCard({ result, display }: { result: CheckResult; display: Display }) {
  const chip = CHIPS[result.status];
  const citations = distinct(result.citations);
  return (
    <article className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm flex flex-col gap-3">
      {result.id === "dollars" && result.label && (
        <div className="rounded-lg bg-[#C9A86A]/15 border border-[#C9A86A] px-3 py-2 text-sm font-semibold uppercase tracking-wide text-[#0A4747]">
          {result.label}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#0A4747]">{TITLES[result.id]}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${chip.className}`}>
          {chip.label}
        </span>
      </div>
      <p className="text-sm text-ink">{display.message}</p>
      {result.id !== "dollars" && result.label && <p className="text-xs text-gray-500">{result.label}</p>}
      {display.rows.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {display.rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1">
              <dt className="text-gray-500">{k}</dt>
              <dd className="font-semibold text-ink text-right">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {display.formula && (
        <div className="rounded-lg bg-[#F8FAFA] px-3 py-2 text-xs text-ink">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mr-2">Formula</span>
          <span className="font-mono">{display.formula}</span>
        </div>
      )}
      {citations.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer select-none font-semibold text-[#0A4747]">Sources ({citations.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {citations.map((c, i) => {
              const s = sourceById(c.source);
              return (
                <div key={i} className="rounded-lg border-l-4 border-[#C9A86A] bg-cream p-3 flex flex-col gap-1">
                  <div className="font-semibold text-[#0A4747]">{s ? displayTitle(s) : c.source}</div>
                  <div className="text-gray-500">
                    Section: {c.section}
                    {c.setid && <> · setid {c.setid}</>}
                    {c.file && !c.file.startsWith("http") && <> · {c.file}</>}
                  </div>
                  <blockquote className="italic text-ink break-words">&ldquo;{c.quote}&rdquo;</blockquote>
                  {s && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#0A4747] underline break-all">
                      {s.url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </article>
  );
}
