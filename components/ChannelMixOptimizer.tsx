"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, SlidersHorizontal } from "lucide-react";
import {
  InputValues,
  ChannelMixCandidate,
  ChannelMixHeatmapCell,
  optimizeChannelMix,
} from "@/lib/calculations";

// ─── Formatters ──────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function selectOnZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] " +
  "focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

// ─── Heatmap color interpolation ─────────────────────────────────────────────
// Green (#22C55E) → Yellow (#EAB308) → Warm gold (#C9A86A)

function heatmapColor(gtn: number, minGtn: number, maxGtn: number): string {
  if (maxGtn <= minGtn) return "#22C55E";
  const t = Math.max(0, Math.min(1, (gtn - minGtn) / (maxGtn - minGtn)));
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const s = t * 2; // 0→1
    r = Math.round(34 + (234 - 34) * s);   // 34→234
    g = Math.round(197 + (179 - 197) * s); // 197→179
    b = Math.round(94 + (8 - 94) * s);     // 94→8
  } else {
    const s = (t - 0.5) * 2; // 0→1
    r = Math.round(234 + (201 - 234) * s); // 234→201
    g = Math.round(179 + (168 - 179) * s); // 179→168
    b = Math.round(8 + (106 - 8) * s);     // 8→106
  }
  return `rgb(${r},${g},${b})`;
}

// ─── Channel percentage bar ───────────────────────────────────────────────────

function PctBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-[#1A1A1A]">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Mix column card ─────────────────────────────────────────────────────────

function MixCard({
  label,
  mix,
  borderColor,
  gtnColor,
  gtnBg,
}: {
  label: string;
  mix: ChannelMixCandidate;
  borderColor: string;
  gtnColor: string;
  gtnBg: string;
}) {
  return (
    <div
      className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-3"
      style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: borderColor }}
      >
        {label}
      </p>

      {/* Channel pct bars */}
      <div className="flex flex-col gap-2">
        <PctBar label="Commercial" pct={mix.commercialPct} color="#0A4747" />
        <PctBar label="Medicaid" pct={mix.medicaidPct} color="#C9A86A" />
        <PctBar label="340B" pct={mix.b340Pct} color="#6B7280" />
      </div>

      <div className="h-px bg-gray-100" />

      {/* Key metrics */}
      <div className="flex flex-col gap-1.5 text-xs">
        <div
          className="flex justify-between rounded-lg px-2 py-1.5"
          style={{ backgroundColor: gtnBg }}
        >
          <span className="text-gray-600 font-medium">GTN Spread</span>
          <span className="font-bold" style={{ color: gtnColor }}>
            {mix.gtnSpread.toFixed(2)}%
          </span>
        </div>
        <div className="flex justify-between px-1">
          <span className="text-gray-500">Total Net Rev.</span>
          <span className="font-semibold text-[#1A1A1A]">{usd.format(mix.totalNetRevenue)}</span>
        </div>
        <div className="flex justify-between px-1">
          <span className="text-gray-500">Incr. Medicaid Exp.</span>
          <span className="font-semibold text-[#1A1A1A]">{usd.format(mix.incrementalMedicaidExposure)}</span>
        </div>
        <div className="flex justify-between px-1">
          <span className="text-gray-500">Cascade Triggered</span>
          <span
            className="font-semibold"
            style={{ color: mix.bestPriceTriggered ? "#EF4444" : "#16A34A" }}
          >
            {mix.bestPriceTriggered ? "YES" : "NO"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ChannelMixOptimizerProps {
  inputs: InputValues;
}

interface Drafts {
  totalVolume: string;
  medicarePartDVolume: string;
  commMin: string;
  medicaidMin: string;
  b340Min: string;
  medicareMin: string;
}

export default function ChannelMixOptimizer({ inputs }: ChannelMixOptimizerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Track whether the user has manually edited total volume
  const [hasCustomTotal, setHasCustomTotal] = useState(false);

  const [drafts, setDrafts] = useState<Drafts>(() => ({
    totalVolume: (inputs.commercialVolume + inputs.medicaidVolume + inputs.volume340B).toString(),
    medicarePartDVolume: "15000",
    commMin: "40",
    medicaidMin: "5",
    b340Min: "2",
    medicareMin: "5",
  }));

  // When main form volumes change, sync total unless user has customised it
  useEffect(() => {
    if (!hasCustomTotal) {
      const newTotal = inputs.commercialVolume + inputs.medicaidVolume + inputs.volume340B;
      setDrafts((prev) => ({ ...prev, totalVolume: newTotal.toString() }));
    }
  }, [inputs.commercialVolume, inputs.medicaidVolume, inputs.volume340B, hasCustomTotal]);

  function setDraft(key: keyof Drafts, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  // ── Parsed numbers ────────────────────────────────────────────────────────
  const parsed = useMemo(() => ({
    totalVolume: Math.max(1, parseNum(drafts.totalVolume)),
    commMin: Math.max(0, Math.min(90, parseNum(drafts.commMin))),
    medicaidMin: Math.max(0, Math.min(50, parseNum(drafts.medicaidMin))),
    b340Min: Math.max(0, parseNum(drafts.b340Min)),
  }), [drafts]);

  // ── Optimizer results ─────────────────────────────────────────────────────
  const results = useMemo(
    () =>
      optimizeChannelMix(inputs, parsed.totalVolume, {
        commercial: parsed.commMin,
        medicaid: parsed.medicaidMin,
        b340: parsed.b340Min,
      }),
    [inputs, parsed.totalVolume, parsed.commMin, parsed.medicaidMin, parsed.b340Min]
  );

  // ── Heatmap GTN range for coloring ───────────────────────────────────────
  const { heatmapMinGtn, heatmapMaxGtn } = useMemo(() => {
    const gtns = results.heatmap
      .flatMap((row) => row.map((cell) => cell.gtnSpread))
      .filter((g): g is number => g !== null);
    return {
      heatmapMinGtn: Math.min(...gtns),
      heatmapMaxGtn: Math.max(...gtns),
    };
  }, [results.heatmap]);

  // ── Savings numbers ───────────────────────────────────────────────────────
  const savingsVsCurrent = results.optimal.totalNetRevenue - results.current.totalNetRevenue;
  const savingsVsWorst = results.optimal.totalNetRevenue - results.worst.totalNetRevenue;

  const spreadImprovement = results.current.gtnSpread - results.optimal.gtnSpread;

  // ── Collapsed badge ───────────────────────────────────────────────────────
  const badgeText = `Optimal GTN: ${results.optimal.gtnSpread.toFixed(1)}% | Current: ${results.current.gtnSpread.toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* ── Toggle header ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C9A86A]/15 flex items-center justify-center">
            <SlidersHorizontal className="w-4 h-4 text-[#C9A86A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">
              Channel Mix Optimizer — Minimize GTN Erosion
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Find the optimal Commercial / Medicaid / 340B split to maximize net revenue
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              {badgeText}
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          )}
        </div>
      </button>

      {/* ── Collapsible body ──────────────────────────────────────────────── */}
      {isOpen && (
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col gap-6">

          {/* ════════════════════════════════════════════════
              INPUTS
          ════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3">
            {/* Row 1: Volume inputs */}
            <div className="grid grid-cols-3 gap-4">
              {/* Total Volume */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Total Volume
                  {hasCustomTotal && (
                    <button
                      onClick={() => setHasCustomTotal(false)}
                      className="ml-2 text-[10px] font-normal text-gray-400 hover:text-[#0A4747] normal-case underline"
                    >
                      reset
                    </button>
                  )}
                </label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={drafts.totalVolume}
                  onChange={(e) => {
                    setHasCustomTotal(true);
                    setDraft("totalVolume", e.target.value);
                  }}
                  onFocus={selectOnZero}
                />
                <p className="text-[10px] text-gray-400">Commercial + Medicaid + 340B</p>
              </div>

              {/* Medicare Part D Volume (informational) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Medicare Part D Vol.
                  <span className="ml-1 text-[10px] font-normal text-gray-400 normal-case">(info)</span>
                </label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={drafts.medicarePartDVolume}
                  onChange={(e) => setDraft("medicarePartDVolume", e.target.value)}
                  onFocus={selectOnZero}
                />
                <p className="text-[10px] text-gray-400">Not in GTN optimization</p>
              </div>

              {/* Commercial Rebate % (auto-filled) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Commercial Rebate %
                  <span className="ml-1 text-[10px] font-normal text-gray-400 normal-case">(auto)</span>
                </label>
                <div className="relative">
                  <input
                    readOnly
                    type="text"
                    value={inputs.commercialRebatePercentage}
                    className={`${inputClass} pr-7 bg-gray-50 text-gray-500 cursor-not-allowed`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
                <p className="text-[10px] text-gray-400">From main inputs</p>
              </div>
            </div>

            {/* Row 2: Channel minimum % constraints */}
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Channel Minimum % Constraints
              </p>
              <div className="grid grid-cols-4 gap-3">
                {(
                  [
                    { key: "commMin" as const, label: "Commercial Min", suffix: "%" },
                    { key: "medicaidMin" as const, label: "Medicaid Min", suffix: "%" },
                    { key: "b340Min" as const, label: "340B Min", suffix: "%" },
                    { key: "medicareMin" as const, label: "Medicare Min", suffix: "% (info)" },
                  ] as const
                ).map(({ key, label, suffix }) => (
                  <div key={key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">{label}</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        max={90}
                        step={1}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm pr-8 focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747]"
                        value={drafts[key]}
                        onChange={(e) => setDraft(key, e.target.value)}
                        onFocus={selectOnZero}
                        readOnly={key === "medicareMin"}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                        {suffix}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════
              3-COLUMN MIX COMPARISON CARDS
          ════════════════════════════════════════════════ */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Channel Mix Comparison
            </p>
            <div className="grid grid-cols-3 gap-4">
              <MixCard
                label="Optimal Mix"
                mix={results.optimal}
                borderColor="#22C55E"
                gtnColor="#16A34A"
                gtnBg="rgba(34,197,94,0.08)"
              />
              <MixCard
                label="Current Mix"
                mix={results.current}
                borderColor="#0A4747"
                gtnColor="#0A4747"
                gtnBg="rgba(10,71,71,0.07)"
              />
              <MixCard
                label="Worst Case"
                mix={results.worst}
                borderColor="#C9A86A"
                gtnColor="#C9A86A"
                gtnBg="rgba(201,168,106,0.12)"
              />
            </div>
          </div>

          {/* ════════════════════════════════════════════════
              SAVINGS CALLOUT / NEAR-OPTIMAL BANNER
          ════════════════════════════════════════════════ */}
          {results.isCurrentOptimal ? (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
              <p className="text-sm font-semibold text-emerald-700">
                Current channel mix is near-optimal. GTN spread is within 0.5% of the best possible mix.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl px-5 py-4 flex flex-col gap-1"
              style={{
                backgroundColor: "rgba(34,197,94,0.06)",
                border: "1px solid rgba(34,197,94,0.25)",
              }}
            >
              <p className="text-sm font-semibold text-[#0A4747]">
                Optimizing channel mix could improve net revenue by{" "}
                <span className="text-emerald-600">{usd.format(Math.max(0, savingsVsCurrent))}</span>
                {" "}annually vs. current mix
                {savingsVsWorst > 0 && (
                  <>
                    {", or "}
                    <span className="text-emerald-600">{usd.format(savingsVsWorst)}</span>
                    {" vs. worst case"}
                  </>
                )}
                {"."}
              </p>
              {spreadImprovement > 0.01 && (
                <p className="text-xs text-gray-500">
                  GTN spread improvement: {spreadImprovement.toFixed(2)} percentage points
                  ({results.current.gtnSpread.toFixed(2)}% → {results.optimal.gtnSpread.toFixed(2)}%)
                </p>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════
              SENSITIVITY HEATMAP
          ════════════════════════════════════════════════ */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
              GTN Spread Heatmap — Commercial % vs Medicaid % (340B fills remainder)
            </p>
            <p className="text-xs text-gray-400 mb-3">
              Green = lowest GTN erosion · Gold = highest GTN erosion · Gray = invalid (340B% &lt; 0)
            </p>

            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#0A4747]">
                      <th
                        className="px-3 py-2.5 text-left text-white/70 font-semibold whitespace-nowrap"
                        style={{ minWidth: 96 }}
                      >
                        Comm % ↓ / Medicaid % →
                      </th>
                      {results.heatmapMedicaidPcts.map((mp) => (
                        <th
                          key={mp}
                          className="px-3 py-2.5 text-center text-white font-semibold whitespace-nowrap"
                        >
                          {mp}%
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.heatmap.map((row, ri) => (
                      <tr key={ri} className="border-b border-gray-100">
                        {/* Row label */}
                        <td className="px-3 py-2 bg-[#0A4747]/8 font-semibold text-[#0A4747] whitespace-nowrap">
                          {results.heatmapCommercialPcts[ri]}%
                        </td>
                        {row.map((cell, ci) => {
                          const isInvalid = cell.gtnSpread === null;
                          const bg = isInvalid
                            ? "#F3F4F6"
                            : heatmapColor(cell.gtnSpread!, heatmapMinGtn, heatmapMaxGtn);

                          // Choose text color for readability
                          // Light backgrounds (green/yellow) → dark text; dark gold → dark text
                          const textColor = isInvalid ? "#9CA3AF" : "#1A1A1A";

                          return (
                            <td
                              key={ci}
                              className="px-2 py-2 text-center font-semibold"
                              style={{
                                backgroundColor: bg,
                                color: textColor,
                                minWidth: 68,
                              }}
                              title={
                                isInvalid
                                  ? `${cell.commercialPct}% Comm + ${cell.medicaidPct}% Medicaid > 100%`
                                  : `${cell.commercialPct}% Comm / ${cell.medicaidPct}% Medicaid / ${cell.b340Pct}% 340B → GTN ${cell.gtnSpread!.toFixed(2)}%`
                              }
                            >
                              {isInvalid ? "—" : `${cell.gtnSpread!.toFixed(1)}%`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Color legend */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4">
                <span className="text-xs text-gray-500 font-medium">GTN Scale:</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#22C55E" }} />
                  <span className="text-xs text-gray-500">{heatmapMinGtn.toFixed(1)}% (min)</span>
                </div>
                <div
                  className="h-3 rounded-sm flex-1 max-w-[120px]"
                  style={{
                    background: "linear-gradient(to right, #22C55E, #EAB308, #C9A86A)",
                  }}
                />
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: "#C9A86A" }} />
                  <span className="text-xs text-gray-500">{heatmapMaxGtn.toFixed(1)}% (max)</span>
                </div>
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════
              RECOMMENDATION TEXT
          ════════════════════════════════════════════════ */}
          {(() => {
            const cascadeAlways =
              results.optimal.bestPriceTriggered && results.worst.bestPriceTriggered;
            const cascadeNever =
              !results.optimal.bestPriceTriggered && !results.worst.bestPriceTriggered;

            let mixDirectionText: string;
            if (cascadeAlways) {
              mixDirectionText =
                `With the current ${inputs.commercialRebatePercentage}% rebate triggering the Best Price ` +
                `cascade, Medicaid net revenue per unit ($${(inputs.wac - results.optimal.medicaidVol > 0 ? inputs.wac - (inputs.wac * inputs.ampPercentage / 100 - results.optimal.incrementalMedicaidExposure / Math.max(1, results.optimal.medicaidVol)) : inputs.wac).toFixed(0)}) ` +
                `exceeds commercial ($${(inputs.wac * (1 - inputs.commercialRebatePercentage / 100)).toFixed(0)}/unit). ` +
                `The optimizer shifts volume toward Medicaid to capture this advantage.`;
              // simpler version
              mixDirectionText =
                `With the current ${inputs.commercialRebatePercentage}% rebate triggering the Best Price cascade, ` +
                `Medicaid net revenue per unit exceeds commercial net revenue per unit. ` +
                `The optimizer shifts volume toward higher-net channels to minimize GTN erosion.`;
            } else if (cascadeNever) {
              mixDirectionText =
                `Without a Best Price cascade at the current ${inputs.commercialRebatePercentage}% rebate, ` +
                `commercial channel yields the highest net revenue per unit — ` +
                `maximizing commercial percentage reduces GTN erosion.`;
            } else {
              mixDirectionText =
                `The optimizer identifies the mix boundary where the Best Price cascade triggers, ` +
                `balancing commercial and Medicaid volumes to minimize GTN erosion across both regimes.`;
            }

            return (
              <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] px-5 py-4 flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Optimizer Recommendation
                </p>
                <p className="text-sm text-[#1A1A1A] leading-relaxed">
                  Based on current pricing inputs (WAC{" "}
                  <span className="font-semibold">${inputs.wac.toLocaleString()}</span>, rebate{" "}
                  <span className="font-semibold">{inputs.commercialRebatePercentage}%</span>,
                  Best Price <span className="font-semibold">${inputs.currentBestPrice.toLocaleString()}</span>
                  ), {mixDirectionText} The primary driver of spread difference between optimal
                  and worst case is{" "}
                  <span className="font-semibold text-[#0A4747]">{results.primaryDriver}</span>.
                </p>
                <p className="text-sm text-[#1A1A1A] leading-relaxed">
                  Optimal mix:{" "}
                  <span className="font-semibold text-emerald-600">
                    {results.optimal.commercialPct.toFixed(0)}% commercial
                  </span>{" "}
                  /{" "}
                  <span className="font-semibold text-[#C9A86A]">
                    {results.optimal.medicaidPct.toFixed(0)}% Medicaid
                  </span>{" "}
                  /{" "}
                  <span className="font-semibold text-gray-600">
                    {results.optimal.b340Pct.toFixed(0)}% 340B
                  </span>{" "}
                  (GTN {results.optimal.gtnSpread.toFixed(2)}%) vs. current{" "}
                  <span className="font-semibold">
                    {results.current.commercialPct.toFixed(0)}% /{" "}
                    {results.current.medicaidPct.toFixed(0)}% /{" "}
                    {results.current.b340Pct.toFixed(0)}%
                  </span>{" "}
                  (GTN {results.current.gtnSpread.toFixed(2)}%).
                  {cascadeAlways && (
                    <span className="text-amber-700">
                      {" "}Note: the Best Price cascade is active at this rebate level for all mix
                      combinations — reducing the commercial rebate below the cascade threshold
                      ({inputs.currentBestPrice / inputs.wac < 1
                        ? ((1 - inputs.currentBestPrice / inputs.wac) * 100).toFixed(1)
                        : "0.0"}
                      %) would shift the optimal mix back toward commercial.
                    </span>
                  )}
                </p>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
