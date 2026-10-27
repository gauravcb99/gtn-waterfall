"use client";

import { findDrug } from "@/lib/drug-line-review/data";
import type { MatchResult } from "@/lib/drug-line-review/types";
import { buttonClass, CardTitle, cardClass } from "./ui";

type Props = { match: MatchResult; confirmedId: string | null; onConfirm: (drugId: string) => void };

export default function MatchCard({ match, confirmedId, onConfirm }: Props) {
  if (match.status !== "candidates")
    return (
      <section className={cardClass}>
        <CardTitle step={2}>Match</CardTitle>
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <span className="font-semibold">{match.status === "no_match" ? "No match: " : "Needs info: "}</span>
          {match.reason}
        </p>
        <p className="text-xs text-gray-500">No checks can run on this line.</p>
      </section>
    );

  return (
    <section className={cardClass}>
      <CardTitle step={2}>Match</CardTitle>
      <p className="text-xs text-gray-500">Matching only suggests candidates. Confirm the drug before any checks run.</p>
      {match.candidates.map((c, i) => {
        const d = findDrug(c.drugId)!;
        const confirmed = confirmedId === c.drugId;
        return (
          <div key={`${c.drugId}-${i}`} className="rounded-lg border-l-4 border-[#0A4747] bg-[#F8FAFA] p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1 text-sm">
              <div className="font-semibold text-[#0A4747]">
                {d.genericName.value} ({d.brandAliases.value.join(", ")}) · {d.hcpcs.value}
              </div>
              <div className="text-xs text-gray-500">{d.hcpcsDescriptor.value} · billing unit {d.billingUnitRaw.value}</div>
              <div className="text-xs text-ink">
                Confidence: <span className="font-semibold">{c.confidence ?? "exact code match"}</span>
                {c.matchedTokens && <> · matched tokens: {c.matchedTokens.join(", ")}</>}
              </div>
              {c.crosswalkDrugName && (
                <div className="text-xs text-ink">
                  CMS crosswalk drug name: <span className="font-semibold">{c.crosswalkDrugName.trim()}</span> · NDC {c.normalizedNdc}
                </div>
              )}
            </div>
            <button type="button" className={buttonClass} disabled={confirmed} onClick={() => onConfirm(c.drugId)}>
              {confirmed ? "Confirmed" : "Confirm this drug"}
            </button>
          </div>
        );
      })}
    </section>
  );
}
