"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import {
  InputValues,
  MultiYearForecastInputs,
  ForecastYearData,
  calculateMultiYearForecast,
} from "@/lib/calculations";

// ─── Formatters ──────────────────────────────────────────────────────────────

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numFmt = new Intl.NumberFormat("en-US");

function fmtPct(v: number, d = 1) {
  return `${v.toFixed(d)}%`;
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─── Safe Rebate Ceiling ──────────────────────────────────────────────────────
// Mirror of the SensitivityAnalysis logic: highest integer rebate % that does
// NOT trigger the cascade at the current Year 0 WAC and Best Price.

function calcSafeCeiling(inputs: InputValues): number {
  for (let rebate = 0; rebate <= 80; rebate++) {
    const netPrice = inputs.wac * (1 - rebate / 100);
    if (netPrice < inputs.currentBestPrice) return rebate - 1;
  }
  return 80;
}

// ─── Cumulative helper ────────────────────────────────────────────────────────

function buildCumulatives(years: ForecastYearData[]): number[] {
  let running = 0;
  return years.map((y) => {
    running += y.totalNetRevenue;
    return running;
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StrategicScenarioComparisonProps {
  inputs: InputValues;
  forecastInputs: MultiYearForecastInputs;
}

// ─── Custom Recharts dot for payback marker ───────────────────────────────────

interface PaybackDotProps {
  cx?: number;
  cy?: number;
  index?: number;
  paybackIndex: number | null;
}

function PaybackDot({ cx = 0, cy = 0, index = 0, paybackIndex }: PaybackDotProps) {
  // Regular data point
  if (paybackIndex === null || index !== paybackIndex) {
    return <circle cx={cx} cy={cy} r={5} fill="#0A4747" strokeWidth={0} />;
  }
  // Payback crossover marker
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="#0A4747" stroke="#fff" strokeWidth={2.5} />
      <circle cx={cx} cy={cy} r={5} fill="#C9A86A" />
      <text
        x={cx}
        y={cy - 20}
        textAnchor="middle"
        fill="#0A4747"
        fontSize={10}
        fontWeight={700}
        fontFamily="var(--font-poppins)"
      >
        PAYBACK
      </text>
    </g>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ScenarioTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const a = payload.find((p) => p.dataKey === "cumA");
  const b = payload.find((p) => p.dataKey === "cumB");
  return (
    <div
      className="rounded-lg bg-white border border-gray-200 shadow-lg p-3 text-xs"
      style={{ fontFamily: "var(--font-poppins)" }}
    >
      <p className="font-bold text-[#0A4747] mb-2">{label}</p>
      {a && (
        <p className="text-gray-600">
          Scenario A:{" "}
          <span className="font-semibold text-[#0A4747]">{usdFull.format(a.value)}</span>
        </p>
      )}
      {b && (
        <p className="text-gray-600">
          Scenario B:{" "}
          <span className="font-semibold text-[#22C55E]">{usdFull.format(b.value)}</span>
        </p>
      )}
      {a && b && (
        <p className="text-gray-500 mt-1 border-t pt-1">
          Δ{" "}
          <span
            className={
              a.value >= b.value ? "font-semibold text-[#0A4747]" : "font-semibold text-[#22C55E]"
            }
          >
            {a.value >= b.value ? "A ahead by " : "B ahead by "}
            {usdFull.format(Math.abs(a.value - b.value))}
          </span>
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StrategicScenarioComparison({
  inputs,
  forecastInputs,
}: StrategicScenarioComparisonProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [bGrowthRaw, setBGrowthRaw] = useState("-5");
  const [bGrowth, setBGrowth] = useState(-5);

  // ── Derived: safe rebate ceiling ────────────────────────────────────────────
  const safeCeiling = useMemo(() => calcSafeCeiling(inputs), [inputs]);

  // ── Run both scenarios ──────────────────────────────────────────────────────
  const computed = useMemo(() => {
    // Scenario A: unmodified inputs + forecast assumptions as-is
    const aResults = calculateMultiYearForecast(inputs, forecastInputs);

    // Scenario B: cap rebate at safe ceiling, no escalation, negative volume growth
    const bBase: InputValues = {
      ...inputs,
      commercialRebatePercentage: Math.max(0, safeCeiling),
    };
    const bForecast: MultiYearForecastInputs = {
      ...forecastInputs,
      commercialRebateEscalationPct: 0,        // stays pinned at ceiling
      commercialVolumeGrowthPct: bGrowth,       // user-specified (default -5%)
    };
    const bResults = calculateMultiYearForecast(bBase, bForecast);

    const cumA = buildCumulatives(aResults.years);
    const cumB = buildCumulatives(bResults.years);
    const N = forecastInputs.forecastYears;
    const totalCumA = cumA[N];
    const totalCumB = cumB[N];

    // Payback: first index where cumA strictly exceeds cumB
    let paybackIndex: number | null = null;
    for (let i = 0; i < cumA.length; i++) {
      if (cumA[i] > cumB[i]) {
        paybackIndex = i;
        break;
      }
    }
    const paybackYear =
      paybackIndex !== null ? aResults.years[paybackIndex].year : null;

    // Winner determination
    const diffPct =
      Math.max(totalCumA, totalCumB) > 0
        ? (Math.abs(totalCumA - totalCumB) / Math.max(totalCumA, totalCumB)) * 100
        : 0;
    const winner: "A" | "B" | "TIE" =
      diffPct < 2 ? "TIE" : totalCumA > totalCumB ? "A" : "B";

    // Cumulative Medicaid exposure
    const cumMedicaidA = aResults.years.reduce(
      (s, y) => s + y.incrementalMedicaidExposure,
      0
    );
    const cumMedicaidB = bResults.years.reduce(
      (s, y) => s + y.incrementalMedicaidExposure,
      0
    );

    return {
      aYears: aResults.years,
      bYears: bResults.years,
      cumA,
      cumB,
      totalCumA,
      totalCumB,
      paybackIndex,
      paybackYear,
      winner,
      diffPct,
      cumMedicaidA,
      cumMedicaidB,
    };
  }, [inputs, forecastInputs, safeCeiling, bGrowth]);

  const {
    aYears,
    bYears,
    cumA,
    cumB,
    totalCumA,
    totalCumB,
    paybackIndex,
    paybackYear,
    winner,
    diffPct,
    cumMedicaidA,
    cumMedicaidB,
  } = computed;

  const N = forecastInputs.forecastYears;
  const finalA = aYears[N];
  const finalB = bYears[N];

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = aYears.map((y, i) => ({
    name: y.year === 0 ? "Year 0" : `Year ${y.year}`,
    cumA: cumA[i],
    cumB: cumB[i],
  }));

  const revenueMax = Math.max(...cumA, ...cumB) * 1.12;

  // ── Cumulative comparison rows ────────────────────────────────────────────
  const cumulativeRows = aYears.map((y, i) => ({
    year: y.year,
    cumA: cumA[i],
    cumB: cumB[i],
    diff: cumA[i] - cumB[i],
    leader: cumA[i] > cumB[i] ? "A" : cumA[i] < cumB[i] ? "B" : "—",
  }));

  // ── Edge case: safe ceiling not meaningful ─────────────────────────────────
  const noSafeCeiling =
    safeCeiling <= 0 &&
    inputs.wac * (1 - 0 / 100) < inputs.currentBestPrice;

  // ── Recommendation text ───────────────────────────────────────────────────
  const recommendation = useMemo(() => {
    const totalMedExp = usdFull.format(cumMedicaidA);
    const diff = usdFull.format(Math.abs(totalCumA - totalCumB));
    if (winner === "TIE") {
      return `The two scenarios produce nearly identical outcomes over ${N} years (within 2% cumulative difference). The decision should be based on non-financial factors such as competitive positioning, long-term PBM relationship value, and pipeline considerations.`;
    }
    if (winner === "A") {
      const paybackClause =
        paybackYear !== null && paybackYear > 0
          ? ` The cascade pays for itself by Year ${paybackYear}.`
          : "";
      return `At the current pricing and volume assumptions, accepting the cascade and protecting formulary position is the stronger long-term strategy. The front-loaded Medicaid penalty of ${usdFull.format(aYears[Math.min(1, N)].incrementalMedicaidExposure)} diminishes each year as AMP rises, while the commercial volume protection generates compounding revenue growth.${paybackClause} Accepting the cascade generates ${diff} more in cumulative net revenue over ${N} years despite ${totalMedExp} in incremental Medicaid costs.`;
    }
    return `At the current pricing and volume assumptions, avoiding the cascade produces better financial outcomes. Staying below the ${safeCeiling}% safe ceiling generates ${diff} more in cumulative net revenue over ${N} years. The commercial volume loss from a weaker formulary position is not large enough to offset the cumulative Medicaid exposure from the cascade. Consider renegotiating the PBM contract at or below the ${safeCeiling}% safe ceiling.`;
  }, [winner, N, totalCumA, totalCumB, cumMedicaidA, aYears, paybackYear, safeCeiling]);

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Collapsible header ───────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left bg-[#0A4747] hover:bg-[#0A4747]/90 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">⚡</span>
          <div>
            <p className="text-sm font-semibold text-white">
              Strategic Decision: Is the Cascade Worth It?
            </p>
            <p className="text-xs text-[#C9A86A] mt-0.5">
              Scenario A (Accept Cascade) vs Scenario B (Stay Below Ceiling) — {N}-year cumulative comparison
            </p>
          </div>
        </div>
        <span className="text-white text-lg font-light select-none">
          {isOpen ? "−" : "+"}
        </span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-6 p-6">
          {/* ── Safe Ceiling notice / edge case ──────────────────────── */}
          {noSafeCeiling && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              No safe rebate ceiling exists — the cascade triggers at all rebate levels for this
              drug. Scenario B cannot avoid the cascade.
            </div>
          )}

          {/* ── Scenario cards ────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4">
            {/* Scenario A card */}
            <div
              className="rounded-xl border border-gray-200 p-4 bg-[#FAF7F2]"
              style={{ borderLeftWidth: 4, borderLeftColor: "#C9A86A" }}
            >
              <p className="text-xs font-bold text-[#92400E] uppercase tracking-wider mb-3">
                Scenario A: Accept the Cascade
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Commercial Rebate (Year 0)</span>
                  <span className="text-sm font-bold text-[#0A4747]">
                    {fmtPct(inputs.commercialRebatePercentage)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Commercial Volume Growth</span>
                  <span className="text-sm font-bold text-[#0A4747]">
                    +{fmtPct(forecastInputs.commercialVolumeGrowthPct)}/yr
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Rebate Escalation</span>
                  <span className="text-sm font-bold text-[#0A4747]">
                    +{forecastInputs.commercialRebateEscalationPct} pts/yr
                  </span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#92400E] bg-[#C9A86A]/15 rounded-lg px-3 py-2 leading-relaxed">
                Triggers Best Price cascade. Protects formulary position.
              </p>
            </div>

            {/* Scenario B card */}
            <div
              className="rounded-xl border border-gray-200 p-4 bg-[#F0FDF4]"
              style={{ borderLeftWidth: 4, borderLeftColor: "#22C55E" }}
            >
              <p className="text-xs font-bold text-[#15803D] uppercase tracking-wider mb-3">
                Scenario B: Stay Below the Ceiling
              </p>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Commercial Rebate (ceiling)</span>
                  <span className="text-sm font-bold text-[#15803D]">
                    {safeCeiling <= 0 ? "N/A" : fmtPct(safeCeiling)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Commercial Volume Growth</span>
                  <div>
                    <input
                      type="number"
                      value={bGrowthRaw}
                      onChange={(e) => {
                        setBGrowthRaw(e.target.value);
                        setBGrowth(parseNum(e.target.value));
                      }}
                      step="1"
                      className="w-20 text-center rounded border border-gray-200 bg-white px-2 py-1 text-sm font-bold text-[#15803D] focus:outline-none focus:border-[#22C55E] focus:ring-1 focus:ring-[#22C55E]"
                    />
                    <span className="text-xs text-gray-500 ml-1">%/yr</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-600">Rebate Escalation</span>
                  <span className="text-sm font-bold text-[#15803D]">0 pts/yr (fixed)</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#15803D] bg-[#22C55E]/10 rounded-lg px-3 py-2 leading-relaxed">
                Avoids cascade. Risks formulary position and volume loss.
              </p>
            </div>
          </div>

          {/* ── Winner banner ─────────────────────────────────────────── */}
          {winner === "A" && (
            <div className="rounded-xl bg-[#0A4747] px-6 py-4 flex items-start gap-3">
              <span className="text-2xl shrink-0">✅</span>
              <div>
                <p className="text-sm font-bold text-white uppercase tracking-wide">
                  The Cascade Is Worth It
                </p>
                <p className="text-xs text-[#C9A86A] mt-1 leading-relaxed">
                  Accepting the cascade generates{" "}
                  <span className="font-bold text-white">
                    {usdFull.format(Math.abs(totalCumA - totalCumB))}
                  </span>{" "}
                  more in cumulative net revenue over {N} years despite{" "}
                  <span className="font-bold text-white">
                    {usdFull.format(cumMedicaidA)}
                  </span>{" "}
                  in incremental Medicaid costs. The volume protection from formulary position
                  outweighs the cascade penalty.
                </p>
              </div>
            </div>
          )}
          {winner === "B" && (
            <div className="rounded-xl bg-[#FAF7F2] border border-[#C9A86A] px-6 py-4 flex items-start gap-3">
              <span className="text-2xl shrink-0">⚠️</span>
              <div>
                <p className="text-sm font-bold text-[#92400E] uppercase tracking-wide">
                  Avoid the Cascade
                </p>
                <p className="text-xs text-[#92400E] mt-1 leading-relaxed">
                  Staying below the{" "}
                  <span className="font-bold">{safeCeiling}%</span> rebate ceiling generates{" "}
                  <span className="font-bold">{usdFull.format(Math.abs(totalCumA - totalCumB))}</span>{" "}
                  more in cumulative net revenue over {N} years. The cascade cost outweighs the
                  volume benefit.
                </p>
              </div>
            </div>
          )}
          {winner === "TIE" && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-6 py-4 flex items-start gap-3">
              <span className="text-2xl shrink-0">⚖️</span>
              <div>
                <p className="text-sm font-bold text-gray-700 uppercase tracking-wide">
                  Scenarios Are Nearly Equal
                </p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Less than 2% cumulative difference over {N} years. Decision should rest on
                  strategic and non-financial factors.
                </p>
              </div>
            </div>
          )}

          {/* ── Cumulative Revenue Chart ───────────────────────────────── */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-[#0A4747]/5 border-b border-gray-100 px-5 py-3">
              <p className="text-xs font-bold text-[#0A4747] uppercase tracking-wider">
                Cumulative Net Revenue Comparison
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Total net revenue accumulated from Year 0 through each forecast year
              </p>
            </div>

            <div className="p-4 bg-white" style={{ height: 500 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 24, right: 24, left: 20, bottom: 10 }}
                >
                  {/* Background shading: green where B leads, teal where A leads */}
                  {chartData.map((d, i) => {
                    if (i === chartData.length - 1) return null;
                    const aAhead = d.cumA >= d.cumB;
                    return (
                      <ReferenceArea
                        key={i}
                        x1={d.name}
                        x2={chartData[i + 1].name}
                        fill={aAhead ? "rgba(10,71,71,0.06)" : "rgba(34,197,94,0.06)"}
                      />
                    );
                  })}

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                  />

                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 12,
                      fontFamily: "var(--font-poppins)",
                      fontWeight: 600,
                      fill: "#1A1A1A",
                    }}
                  />

                  <YAxis
                    domain={[0, revenueMax]}
                    tickFormatter={(v) => usdCompact.format(v)}
                    axisLine={false}
                    tickLine={false}
                    tick={{
                      fontSize: 11,
                      fontFamily: "var(--font-poppins)",
                      fill: "#9CA3AF",
                    }}
                    width={72}
                  />

                  <Tooltip content={<ScenarioTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />

                  {/* Scenario B line (green) */}
                  <Line
                    type="monotone"
                    dataKey="cumB"
                    stroke="#22C55E"
                    strokeWidth={3}
                    dot={{ fill: "#22C55E", r: 5, strokeWidth: 0 }}
                    activeDot={{ r: 7 }}
                    name="Scenario B"
                  />

                  {/* Scenario A line (deep teal) with payback dot */}
                  <Line
                    type="monotone"
                    dataKey="cumA"
                    stroke="#0A4747"
                    strokeWidth={3}
                    dot={(props: { cx?: number; cy?: number; index?: number }) => (
                      <PaybackDot
                        key={`dot-${props.index ?? 0}`}
                        cx={props.cx}
                        cy={props.cy}
                        index={props.index}
                        paybackIndex={paybackIndex}
                      />
                    )}
                    activeDot={{ r: 7 }}
                    name="Scenario A"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Chart legend */}
            <div className="px-5 pb-4 flex items-center gap-6 border-t border-gray-50 pt-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-[#0A4747]" style={{ height: 3 }} />
                <span className="text-xs text-gray-500">Scenario A — Accept Cascade</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8" style={{ height: 3, backgroundColor: "#22C55E" }} />
                <span className="text-xs text-gray-500">Scenario B — Stay Below Ceiling</span>
              </div>
              {paybackYear !== null && paybackYear > 0 && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full bg-[#0A4747] flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-[#C9A86A]" />
                  </div>
                  <span className="text-xs text-gray-500">
                    Payback in Year {paybackYear}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Year-by-Year Cumulative Table ──────────────────────────── */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#0A4747]/8 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-700 bg-[#FAF7F2]">
                    Year
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#0A4747]">
                    Scenario A Cumulative
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#15803D]">
                    Scenario B Cumulative
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Difference (A−B)
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-600">
                    Leader
                  </th>
                </tr>
              </thead>
              <tbody>
                {cumulativeRows.map((row) => (
                  <tr key={row.year} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 font-semibold text-gray-700 bg-[#FAF7F2]">
                      Year {row.year}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        row.leader === "A"
                          ? "text-[#0A4747] font-bold"
                          : "text-gray-600"
                      }`}
                    >
                      {usdCompact.format(row.cumA)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        row.leader === "B"
                          ? "text-[#15803D] font-bold"
                          : "text-gray-600"
                      }`}
                    >
                      {usdCompact.format(row.cumB)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-semibold ${
                        row.diff > 0
                          ? "text-[#0A4747]"
                          : row.diff < 0
                          ? "text-[#15803D]"
                          : "text-gray-500"
                      }`}
                    >
                      {row.diff > 0 ? "+" : ""}
                      {usdCompact.format(row.diff)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {row.leader === "A" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-[#0A4747]/10 text-[#0A4747] text-xs font-bold">
                          A
                        </span>
                      ) : row.leader === "B" ? (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-[#22C55E]/15 text-[#15803D] text-xs font-bold">
                          B
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Side-by-Side Metrics Table ─────────────────────────────── */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#0A4747]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-white min-w-[200px]">
                    Metric
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#C9A86A]">
                    Scenario A (Cascade)
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-[#86EFAC]">
                    Scenario B (Safe)
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-300">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Final Year Rebate % */}
                <MetricRow
                  label={`Year ${N} Rebate %`}
                  aVal={fmtPct(finalA.commercialRebatePct)}
                  bVal={fmtPct(finalB.commercialRebatePct)}
                  diff={`${finalA.commercialRebatePct > finalB.commercialRebatePct ? "+" : ""}${(finalA.commercialRebatePct - finalB.commercialRebatePct).toFixed(1)} pts`}
                  aWins={finalA.commercialRebatePct < finalB.commercialRebatePct}
                  bWins={finalB.commercialRebatePct < finalA.commercialRebatePct}
                />
                {/* Final Year GTN Spread */}
                <MetricRow
                  label={`Year ${N} GTN Spread`}
                  aVal={fmtPct(finalA.gtnSpreadPct)}
                  bVal={fmtPct(finalB.gtnSpreadPct)}
                  diff={`${finalA.gtnSpreadPct > finalB.gtnSpreadPct ? "+" : ""}${(finalA.gtnSpreadPct - finalB.gtnSpreadPct).toFixed(1)} pts`}
                  aWins={finalA.gtnSpreadPct < finalB.gtnSpreadPct}
                  bWins={finalB.gtnSpreadPct < finalA.gtnSpreadPct}
                />
                {/* Cumulative Net Revenue */}
                <MetricRow
                  label="Cumulative Net Revenue"
                  aVal={usdCompact.format(totalCumA)}
                  bVal={usdCompact.format(totalCumB)}
                  diff={`${totalCumA > totalCumB ? "+" : ""}${usdCompact.format(totalCumA - totalCumB)}`}
                  aWins={totalCumA > totalCumB}
                  bWins={totalCumB > totalCumA}
                  highlight
                />
                {/* Cumulative Medicaid Exposure */}
                <MetricRow
                  label="Cumulative Medicaid Exposure"
                  aVal={usdCompact.format(cumMedicaidA)}
                  bVal={usdCompact.format(cumMedicaidB)}
                  diff={`${cumMedicaidA > cumMedicaidB ? "+" : ""}${usdCompact.format(cumMedicaidA - cumMedicaidB)}`}
                  aWins={cumMedicaidA < cumMedicaidB}
                  bWins={cumMedicaidB < cumMedicaidA}
                />
                {/* Final Year Commercial Volume */}
                <MetricRow
                  label={`Year ${N} Commercial Volume`}
                  aVal={numFmt.format(finalA.commercialVolume)}
                  bVal={numFmt.format(finalB.commercialVolume)}
                  diff={`${finalA.commercialVolume > finalB.commercialVolume ? "+" : ""}${numFmt.format(finalA.commercialVolume - finalB.commercialVolume)}`}
                  aWins={finalA.commercialVolume > finalB.commercialVolume}
                  bWins={finalB.commercialVolume > finalA.commercialVolume}
                />
                {/* Final Year Total Net Revenue */}
                <MetricRow
                  label={`Year ${N} Total Net Revenue`}
                  aVal={usdCompact.format(finalA.totalNetRevenue)}
                  bVal={usdCompact.format(finalB.totalNetRevenue)}
                  diff={`${finalA.totalNetRevenue > finalB.totalNetRevenue ? "+" : ""}${usdCompact.format(finalA.totalNetRevenue - finalB.totalNetRevenue)}`}
                  aWins={finalA.totalNetRevenue > finalB.totalNetRevenue}
                  bWins={finalB.totalNetRevenue > finalA.totalNetRevenue}
                />
              </tbody>
            </table>
          </div>

          {/* ── Recommendation ────────────────────────────────────────── */}
          <div
            className="rounded-xl bg-[#FAF7F2] p-5 shadow-sm"
            style={{ borderLeft: "4px solid #5BA3A3" }}
          >
            <h4 className="text-xs font-bold text-[#0A4747] uppercase tracking-wider mb-2 flex items-center gap-2">
              <span>📋</span> Strategic Recommendation
            </h4>
            <p className="text-sm text-[#1A1A1A] leading-relaxed">{recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MetricRow helper ─────────────────────────────────────────────────────────

interface MetricRowProps {
  label: string;
  aVal: string;
  bVal: string;
  diff: string;
  aWins: boolean;
  bWins: boolean;
  highlight?: boolean;
}

function MetricRow({
  label,
  aVal,
  bVal,
  diff,
  aWins,
  bWins,
  highlight,
}: MetricRowProps) {
  return (
    <tr
      className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
        highlight ? "bg-[#0A4747]/3" : ""
      }`}
    >
      <td className="px-4 py-2.5 text-xs font-semibold text-gray-700 bg-[#FAF7F2]">
        {label}
      </td>
      <td
        className={`px-4 py-2.5 text-center text-xs font-medium ${
          aWins
            ? "bg-[#0A4747]/10 text-[#0A4747] font-bold"
            : "text-gray-600"
        }`}
      >
        {aVal}
        {aWins && (
          <span className="ml-1 text-[10px] text-[#0A4747] font-bold">✓</span>
        )}
      </td>
      <td
        className={`px-4 py-2.5 text-center text-xs font-medium ${
          bWins
            ? "bg-[#22C55E]/10 text-[#15803D] font-bold"
            : "text-gray-600"
        }`}
      >
        {bVal}
        {bWins && (
          <span className="ml-1 text-[10px] text-[#15803D] font-bold">✓</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-center text-xs text-gray-500">{diff}</td>
    </tr>
  );
}
