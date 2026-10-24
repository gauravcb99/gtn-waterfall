"use client";

import type { CheckResult, CheckStatus } from "@/lib/drug-line-review/types";
import { displayTitle, sourceById } from "./sources";

const TITLES: Record<CheckResult["id"], string> = {
  dose: "Dose",
  dose_advisory: "Label maximum",
  vials: "Vials and waste",
  vial_advisory: "Vial choice",
  units: "Units billed",
  jw_jz: "JW / JZ modifiers",
  benchmark: "Benchmark vs CMS payment limit",
  dollars: "Dollars at stake",
};

const CHIPS: Record<CheckStatus, { label: string; className: string }> = {
  pass: { label: "pass", className: "bg-emerald-50 text-emerald-700" },
  flag: { label: "flag", className: "bg-red-50 text-red-700" },
  advisory: { label: "advisory", className: "bg-amber-50 text-amber-700" },
  needs_info: { label: "needs info", className: "bg-gray-100 text-gray-700" },
  info: { label: "info", className: "bg-[#E8F5F5] text-[#0A4747]" },
  not_applicable: { label: "not applicable", className: "bg-gray-50 text-gray-500" },
};

const VALUE_LABELS: Record<string, string> = {
  doseAmount: "Dose (billing measure)",
  doseUnits: "Dose in billing units",
  capped: "Capped at label maximum",
  vials: "Vials",
  basis: "Vial basis",
  drawn: "Drawn",
  waste: "Waste",
  wasteUnits: "Waste (billing units)",
  maxValidUnits: "Max valid units",
  leastWasteVials: "Least-waste vials",
  leastWaste: "Least possible waste",
  totalBilled: "Total billed units",
  excess: "Excess units",
  expected: "Expected modifier",
  administeredUnits: "Administered units",
  jwUnitsBilled: "JW units billed",
  jzReported: "JZ reported",
  paymentLimit: "CMS payment limit (per unit)",
  billedPerUnit: "Billed per unit",
  markup: "Markup",
  benchmarkTotal: "Benchmark total",
  quarter: "Quarter",
  amount: "Amount",
  amountAtBilledRate: "At billed rate",
  amountAtPaymentLimit: "At CMS payment limit",
};

function formatValue(key: string, v: number | string | boolean | number[]): string {
  if (Array.isArray(v)) return v.join(" + ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "string") return v;
  if (key === "markup") return `${v.toFixed(2)}x`;
  if (key === "paymentLimit") return `$${v}`; // shown exactly as in the CMS file
  if (["billedPerUnit", "benchmarkTotal", "amount", "amountAtBilledRate", "amountAtPaymentLimit"].includes(key))
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return String(v);
}

export default function ResultCard({ result }: { result: CheckResult }) {
  const chip = CHIPS[result.status];
  const entries = Object.entries(result.values);
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
      <p className="text-sm text-ink">{result.message}</p>
      {result.id !== "dollars" && result.label && <p className="text-xs text-gray-500">{result.label}</p>}
      {entries.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-gray-50 py-1">
              <dt className="text-gray-500">{VALUE_LABELS[k] ?? k}</dt>
              <dd className="font-semibold text-ink text-right">{formatValue(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {result.formula && (
        <div className="rounded-lg bg-[#F8FAFA] px-3 py-2 text-xs text-ink">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mr-2">Formula</span>
          <span className="font-mono">{result.formula}</span>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {result.citations.map((c, i) => {
          const s = sourceById(c.source);
          return (
            <div key={i} className="rounded-lg border-l-4 border-[#C9A86A] bg-cream p-3 text-xs flex flex-col gap-1">
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
    </article>
  );
}
