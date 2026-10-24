"use client";

import { useState } from "react";
import { runChecks } from "@/lib/drug-line-review/checks";
import { findDrug } from "@/lib/drug-line-review/data";
import { matchLine } from "@/lib/drug-line-review/match";
import type { ChecksOutcome, MatchResult } from "@/lib/drug-line-review/types";
import ClaimForm from "./ClaimForm";
import { EXAMPLES } from "./examples";
import { EMPTY_CLAIM, EMPTY_RECORD, toClaimLine, type ClaimFormState, type RecordFormState } from "./forms";
import MatchCard from "./MatchCard";
import Methodology from "./Methodology";
import RecordForm from "./RecordForm";
import ResultCard from "./ResultCard";
import { CardTitle, inputClass, labelClass } from "./ui";

const MATCH_FIELDS: (keyof ClaimFormState)[] = ["lineType", "description", "hcpcs", "ndc"];

export default function DrugLineReview() {
  const [claim, setClaim] = useState<ClaimFormState>(EMPTY_CLAIM);
  const [record, setRecord] = useState<RecordFormState>(EMPTY_RECORD);
  const [illustrativeCharge, setIllustrativeCharge] = useState(false);
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [drugId, setDrugId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ChecksOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const drug = drugId ? findDrug(drugId) : undefined;

  function editClaim(patch: Partial<ClaimFormState>) {
    setClaim((c) => ({ ...c, ...patch }));
    if ("amountBilled" in patch) setIllustrativeCharge(false);
    // Changing what identifies the drug invalidates the match and the confirmation.
    if (MATCH_FIELDS.some((k) => k in patch)) {
      setMatch(null);
      setDrugId(null);
    }
    setOutcome(null);
  }

  function editRecord(patch: Partial<RecordFormState>) {
    setRecord((r) => ({ ...r, ...patch }));
    setOutcome(null);
    setError(null);
  }

  function find(c: ClaimFormState) {
    setMatch(matchLine(c));
    setDrugId(null);
    setOutcome(null);
    setError(null);
  }

  function loadExample(index: number) {
    const ex = EXAMPLES[index];
    setClaim(ex.claim);
    setRecord(ex.record);
    setIllustrativeCharge(true);
    find(ex.claim);
  }

  function run() {
    const r = toClaimLine(claim, record);
    if ("error" in r) {
      setError(r.error);
      setOutcome(null);
      return;
    }
    setError(null);
    setOutcome(runChecks(r.line, drugId));
  }

  return (
    <div className="min-h-screen">
      <header className="bg-[#0A4747] px-8 py-5 shadow-md">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold text-white tracking-tight">Drug Line Review (payer view)</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6">
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Demonstration using public CMS and FDA data. Illustrative only, not billing, coding, legal or payment advice.
          Recovery depends on contract terms and payer policy.
        </p>

        <label className="flex flex-col gap-1.5 sm:max-w-md">
          <span className={labelClass}>Load example</span>
          <select
            className={inputClass}
            value=""
            onChange={(e) => e.target.value !== "" && loadExample(Number(e.target.value))}
          >
            <option value="">Choose an example line…</option>
            {EXAMPLES.map((ex, i) => (
              <option key={ex.label} value={i}>
                {ex.label}
              </option>
            ))}
          </select>
        </label>

        <ClaimForm claim={claim} onChange={editClaim} onFind={() => { setRecord(EMPTY_RECORD); find(claim); }}
          illustrativeCharge={illustrativeCharge} />

        {match && (
          <MatchCard match={match} confirmedId={drugId} onConfirm={(id) => { setDrugId(id); setOutcome(null); }} />
        )}

        {drug && <RecordForm drug={drug} record={record} onChange={editRecord} onRun={run} error={error} />}

        {drug && outcome && (
          <section className="flex flex-col gap-4">
            <CardTitle step={4}>Results</CardTitle>
            {outcome.status === "refused" ? (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{outcome.reason}</p>
            ) : (
              outcome.results.map((r) => <ResultCard key={r.id} result={r} />)
            )}
          </section>
        )}

        <Methodology />
      </main>
    </div>
  );
}
