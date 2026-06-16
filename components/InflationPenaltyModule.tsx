"use client";

import { useState, useMemo } from "react";
import { AuditIcon } from "./AuditIcon";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from "recharts";
import {
  InputValues,
  InflationPenaltyInputs,
  InflationForecastScenario,
  calculateInflationPenalty,
  calculateInflationForecast,
} from "@/lib/calculations";

// ─── Formatters ──────────────────────────────────────────────────────────────

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtPct(v: number, decimals = 1) {
  return `${v.toFixed(decimals)}%`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function selectOnZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

// ─── Per-year accessor helper ─────────────────────────────────────────────────

function getYearData(s: InflationForecastScenario, year: 1 | 2 | 3) {
  if (year === 1) return { wac: s.year1Wac, ppu: s.year1PenaltyPerUnit, total: s.year1TotalPenalty };
  if (year === 2) return { wac: s.year2Wac, ppu: s.year2PenaltyPerUnit, total: s.year2TotalPenalty };
  return { wac: s.year3Wac, ppu: s.year3PenaltyPerUnit, total: s.year3TotalPenalty };
}

// Fixed strategy display colors
const STRATEGY_COLORS = ["#16A34A", "#0A4747", "#C9A86A"] as const;

const STRATEGY_BG = [
  "rgba(34,197,94,0.04)",
  "#FAF7F2",
  "rgba(201,168,106,0.08)",
] as const;

// ─── Custom bar chart tooltip ─────────────────────────────────────────────────

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs" style={{ fontFamily: "Poppins, sans-serif" }}>
      <p className="font-semibold text-[#0A4747] mb-1">{label}</p>
      <div className="flex justify-between gap-4">
        <span className="text-gray-500">3-Year Cumulative Penalty</span>
        <span className="font-semibold text-[#1A1A1A]">{usd.format(payload[0].value)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface InflationPenaltyModuleProps {
  inputs: InputValues;
}

interface PenaltyDrafts {
  launchYear: string;
  launchWac: string;
  cpiRatePct: string;
  medicarePartDVolume: string;
}

interface StrategyDraft {
  label: string;
  rate: string;
}

const DEFAULT_DRAFTS: PenaltyDrafts = {
  launchYear: "2015",
  launchWac: "500",
  cpiRatePct: "2.5",
  medicarePartDVolume: "15000",
};

const DEFAULT_STRATEGIES: StrategyDraft[] = [
  { label: "Conservative", rate: "0" },
  { label: "Moderate", rate: "3" },
  { label: "Aggressive", rate: "6" },
];

export default function InflationPenaltyModule({ inputs }: InflationPenaltyModuleProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<PenaltyDrafts>(DEFAULT_DRAFTS);
  const [strategies, setStrategies] = useState<StrategyDraft[]>(DEFAULT_STRATEGIES);

  function setDraft(key: keyof PenaltyDrafts, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function setStrategyRate(index: number, rate: string) {
    setStrategies((prev) => prev.map((s, i) => (i === index ? { ...s, rate } : s)));
  }

  // ── Build typed inputs from drafts + main form ────────────────────────────
  const penaltyInputs: InflationPenaltyInputs = useMemo(
    () => ({
      launchYear: parseNum(drafts.launchYear),
      launchWac: parseNum(drafts.launchWac),
      currentWac: inputs.wac,
      cpiRatePct: parseNum(drafts.cpiRatePct),
      medicaidVolume: inputs.medicaidVolume,
      medicarePartDVolume: parseNum(drafts.medicarePartDVolume),
    }),
    [drafts, inputs.wac, inputs.medicaidVolume]
  );

  const penaltyResults = useMemo(() => calculateInflationPenalty(penaltyInputs), [penaltyInputs]);

  const forecastScenarios = useMemo(
    () =>
      calculateInflationForecast(
        penaltyInputs,
        penaltyResults,
        strategies.map((s) => ({ label: s.label, annualIncreasePct: parseNum(s.rate) }))
      ),
    [penaltyInputs, penaltyResults, strategies]
  );

  // ── Cumulative min/max for highlighting ───────────────────────────────────
  const cumulatives = forecastScenarios.map((s) => s.cumulativePenalty);
  const minCumulative = Math.min(...cumulatives);
  const maxCumulative = Math.max(...cumulatives);
  const allEqual = minCumulative === maxCumulative;

  // ── Bar chart data ────────────────────────────────────────────────────────
  const chartData = forecastScenarios.map((s, i) => ({
    name: s.label,
    cumulative: s.cumulativePenalty,
    color: STRATEGY_COLORS[i],
  }));

  // ── Collapsed badge ───────────────────────────────────────────────────────
  const badgeText = penaltyResults.hasPenalty
    ? `-${usd.format(penaltyResults.totalAnnualPenalty)} annual penalty`
    : "No inflation penalty";

  // ── Detail table rows ─────────────────────────────────────────────────────
  const detailRows: [string, string][] = [
    ["Launch Year", penaltyInputs.launchYear > 0 ? penaltyInputs.launchYear.toString() : "—"],
    ["Launch WAC", usd2.format(penaltyInputs.launchWac)],
    ["Years on Market", penaltyResults.years.toString()],
    ["Average CPI-U", fmtPct(penaltyInputs.cpiRatePct, 1)],
    ["Actual Annual WAC Growth", fmtPct(penaltyResults.actualCagr, 2)],
    ["Inflation-Adjusted WAC", usd2.format(penaltyResults.inflationAdjustedWac)],
    ["Current WAC", usd2.format(inputs.wac)],
    ["Penalty Per Unit", usd2.format(penaltyResults.penaltyPerUnit)],
    ["Penalty as % of WAC", fmtPct(penaltyResults.penaltyAsPctOfWac, 1)],
    ["Medicaid Penalty", usd.format(penaltyResults.medicaidPenalty)],
    ["Medicare Penalty", usd.format(penaltyResults.medicarePenalty)],
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* ── Toggle header ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C9A86A]/15 flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-[#C9A86A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">Inflation Rebate Penalty Analysis</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Model CPI-U penalty exposure and WAC increase strategy comparison
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                color: penaltyResults.hasPenalty ? "#C9A86A" : "#16A34A",
                backgroundColor: penaltyResults.hasPenalty
                  ? "rgba(201,168,106,0.1)"
                  : "rgba(22,163,74,0.1)",
              }}
            >
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
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col gap-8">

          {/* ════════════════════════════════════════════════════════════════
              SUB-SECTION 1 — CURRENT PENALTY EXPOSURE
          ════════════════════════════════════════════════════════════════ */}
          <div>
            <p className="text-sm font-semibold text-[#0A4747] uppercase tracking-wide mb-4">
              Current Penalty Exposure
            </p>

            {/* ── Input row ─────────────────────────────────────────────── */}
            <div className="grid grid-cols-6 gap-3 mb-5">
              {/* Launch Year */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Launch Year
                </label>
                <input
                  type="number"
                  min={1980}
                  max={2025}
                  className={inputClass}
                  value={drafts.launchYear}
                  onChange={(e) => setDraft("launchYear", e.target.value)}
                />
              </div>

              {/* Launch WAC */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Launch WAC
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min={1}
                    className={`${inputClass} pl-6`}
                    value={drafts.launchWac}
                    onChange={(e) => setDraft("launchWac", e.target.value)}
                    onFocus={selectOnZero}
                  />
                </div>
              </div>

              {/* Current WAC — auto-filled from main inputs */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Current WAC{" "}
                  <span className="text-[10px] font-normal text-gray-400 normal-case">(auto)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    readOnly
                    type="text"
                    value={inputs.wac.toLocaleString()}
                    className={`${inputClass} pl-6 bg-gray-50 text-gray-500 cursor-not-allowed`}
                  />
                </div>
              </div>

              {/* Avg CPI-U % */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Avg CPI-U %
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={0.1}
                    className={`${inputClass} pr-7`}
                    value={drafts.cpiRatePct}
                    onChange={(e) => setDraft("cpiRatePct", e.target.value)}
                    onFocus={selectOnZero}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </div>

              {/* Medicaid Volume — auto-filled from main inputs */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Medicaid Vol.{" "}
                  <span className="text-[10px] font-normal text-gray-400 normal-case">(auto)</span>
                </label>
                <input
                  readOnly
                  type="text"
                  value={inputs.medicaidVolume.toLocaleString()}
                  className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
                />
              </div>

              {/* Medicare Part D Volume */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                  Medicare D Vol.
                </label>
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={drafts.medicarePartDVolume}
                  onChange={(e) => setDraft("medicarePartDVolume", e.target.value)}
                  onFocus={selectOnZero}
                />
              </div>
            </div>

            {/* ── Alert banner ──────────────────────────────────────────── */}
            {penaltyResults.hasPenalty ? (
              <div className="flex items-start gap-3 rounded-xl bg-[#C9A86A]/12 border border-[#C9A86A]/60 px-4 py-3 mb-5">
                <TrendingUp className="w-5 h-5 text-[#C9A86A] shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-[#0A4747]">
                  INFLATION PENALTY:{" "}
                  <span className="text-[#C9A86A]">{usd2.format(penaltyResults.penaltyPerUnit)}</span>
                  {" "}per unit above inflation-adjusted price. Total annual exposure:{" "}
                  <span className="text-[#C9A86A]">{usd.format(penaltyResults.totalAnnualPenalty)}</span>
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 mb-5">
                <TrendingUp className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-emerald-700">
                  No inflation penalty. WAC has grown at or below CPI-U rate.
                </p>
              </div>
            )}

            {/* ── Four metric cards ─────────────────────────────────────── */}
            <div className="grid grid-cols-4 gap-4 mb-5">
              <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Inflation-Adjusted WAC
                </p>
                <p className="text-xl font-bold text-[#0A4747]">
                  {usd2.format(penaltyResults.inflationAdjustedWac)}
                </p>
                <p className="text-xs text-gray-400">WAC if growth matched CPI-U</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Actual WAC
                </p>
                <p className="text-xl font-bold text-[#0A4747]">{usd2.format(inputs.wac)}</p>
                <p className="text-xs text-gray-400">Current WAC per unit</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Penalty Per Unit
                </p>
                <div className="text-xl font-bold text-[#C9A86A] flex items-center gap-1">
                  {usd2.format(penaltyResults.penaltyPerUnit)}
                  <AuditIcon
                    formula="Penalty = max(0, AMP − Inflation-Adjusted AMP Benchmark) where benchmark = AMP at base period × cumulative CPI-U"
                    inputs={[
                      { name: "Current WAC", value: usd2.format(inputs.wac) },
                      { name: "Inflation-Adjusted WAC", value: usd2.format(penaltyResults.inflationAdjustedWac) },
                      { name: "Penalty per Unit", value: usd2.format(penaltyResults.penaltyPerUnit) },
                    ]}
                    citation="SSA §1847A(i) — Part B inflation rebates; SSA §1860D-14B — Part D inflation rebates"
                  />
                </div>
                <p className="text-xs text-gray-400">WAC above inflation-adjusted price</p>
              </div>

              <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] p-4 flex flex-col gap-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Total Annual Penalty
                </p>
                <div className="text-2xl font-bold text-[#C9A86A] flex items-center gap-1">
                  {usd.format(penaltyResults.totalAnnualPenalty)}
                  <AuditIcon
                    formula="Annual Penalty Total = Penalty per Unit × Annual Unit Volume"
                    inputs={[
                      { name: "Penalty per Unit", value: usd2.format(penaltyResults.penaltyPerUnit) },
                      { name: "Medicaid Volume", value: penaltyInputs.medicaidVolume.toLocaleString() },
                      { name: "Medicare Part D Volume", value: penaltyInputs.medicarePartDVolume.toLocaleString() },
                      { name: "Total Annual Penalty", value: usd.format(penaltyResults.totalAnnualPenalty) },
                    ]}
                    citation="Derived from SSA §1847A(i) — Part B inflation rebates; SSA §1860D-14B — Part D inflation rebates"
                  />
                </div>
                <p className="text-xs text-gray-400">Medicaid + Medicare combined</p>
              </div>
            </div>

            {/* ── Penalty detail table ──────────────────────────────────── */}
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-[#0A4747] px-4 py-2.5">
                <h3 className="text-sm font-semibold text-white">Penalty Detail</h3>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {detailRows.map(([label, value], i) => (
                    <tr
                      key={label}
                      className={`border-b border-gray-50 ${
                        i % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-2.5 text-gray-600">{label}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#1A1A1A]">
                        {value}
                      </td>
                    </tr>
                  ))}
                  {/* Total row — deep teal */}
                  <tr className="bg-[#0A4747]">
                    <td className="px-4 py-3.5 font-semibold text-[#C9A86A] uppercase text-xs tracking-wide">
                      Total Annual Penalty
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="text-xl font-semibold text-white">
                        {usd.format(penaltyResults.totalAnnualPenalty)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              SUB-SECTION 2 — FORWARD-LOOKING WAC INCREASE COMPARISON
          ════════════════════════════════════════════════════════════════ */}
          <div>
            <p className="text-sm font-semibold text-[#0A4747] uppercase tracking-wide mb-4">
              WAC Increase Strategy Comparison — Next 3 Years
            </p>

            {/* ── Editable strategy cards ───────────────────────────────── */}
            <div className="grid grid-cols-3 gap-4 mb-5">
              {strategies.map((s, i) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-gray-100 p-4"
                  style={{ backgroundColor: STRATEGY_BG[i] }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-wide mb-3"
                    style={{ color: STRATEGY_COLORS[i] }}
                  >
                    {s.label}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">Annual WAC Increase:</span>
                    <div className="relative flex-1 max-w-[88px]">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        className="w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-right focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] pr-6"
                        value={s.rate}
                        onChange={(e) => setStrategyRate(i, e.target.value)}
                        onFocus={selectOnZero}
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Comparison table ──────────────────────────────────────── */}
            <div className="rounded-xl border border-gray-100 overflow-hidden mb-5">
              <div className="bg-[#0A4747] px-4 py-2.5">
                <h3 className="text-sm font-semibold text-white">3-Year Penalty Projection</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 w-40" />
                      {forecastScenarios.map((s, i) => (
                        <th
                          key={s.label}
                          className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ color: STRATEGY_COLORS[i] }}
                        >
                          {s.label} ({s.annualIncreasePct}%)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([1, 2, 3] as const).map((year) => {
                      const bg1 = year % 2 !== 0 ? "bg-white" : "bg-gray-50/40";
                      return (
                        <>
                          <tr key={`y${year}-wac`} className={`border-b border-gray-50 ${bg1}`}>
                            <td className="px-4 py-2.5 font-medium text-gray-700 whitespace-nowrap">
                              Year {year} WAC
                            </td>
                            {forecastScenarios.map((s, i) => (
                              <td key={i} className="px-4 py-2.5 text-right font-semibold text-[#1A1A1A]">
                                {usd2.format(getYearData(s, year).wac)}
                              </td>
                            ))}
                          </tr>
                          <tr key={`y${year}-ppu`} className={`border-b border-gray-50 ${bg1}`}>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              Year {year} Penalty/Unit
                            </td>
                            {forecastScenarios.map((s, i) => (
                              <td key={i} className="px-4 py-2.5 text-right text-[#1A1A1A]">
                                {usd2.format(getYearData(s, year).ppu)}
                              </td>
                            ))}
                          </tr>
                          <tr key={`y${year}-total`} className="border-b border-gray-100 bg-white">
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                              Year {year} Total Penalty
                            </td>
                            {forecastScenarios.map((s, i) => (
                              <td key={i} className="px-4 py-2.5 text-right font-semibold text-[#1A1A1A]">
                                {usd.format(getYearData(s, year).total)}
                              </td>
                            ))}
                          </tr>
                        </>
                      );
                    })}
                    {/* 3-Year cumulative row */}
                    <tr className="bg-[#0A4747]">
                      <td className="px-4 py-3.5 font-semibold text-[#C9A86A] uppercase text-xs tracking-wide whitespace-nowrap">
                        3-Year Cumulative
                      </td>
                      {forecastScenarios.map((s, i) => {
                        const isMin = !allEqual && s.cumulativePenalty === minCumulative;
                        const isMax = !allEqual && s.cumulativePenalty === maxCumulative;
                        return (
                          <td key={i} className="px-4 py-3.5 text-right">
                            <span
                              className="text-base font-bold px-2.5 py-1 rounded"
                              style={{
                                color: isMin ? "#16A34A" : isMax ? "#C9A86A" : "white",
                                backgroundColor: isMin
                                  ? "rgba(22,163,74,0.18)"
                                  : isMax
                                  ? "rgba(201,168,106,0.22)"
                                  : "transparent",
                              }}
                            >
                              {usd.format(s.cumulativePenalty)}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── Cumulative bar chart ──────────────────────────────────── */}
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 36, right: 24, bottom: 8, left: 64 }}
                  barSize={72}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 12, fill: "#374151", fontFamily: "Poppins, sans-serif", fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => {
                      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
                      return `$${v}`;
                    }}
                    tick={{ fontSize: 10, fill: "#6B7280", fontFamily: "Poppins, sans-serif" }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                  />
                  <Tooltip content={<BarTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="cumulative" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} fillOpacity={0.85} />
                    ))}
                    <LabelList
                      dataKey="cumulative"
                      position="top"
                      formatter={(value: unknown) => usd.format(Number(value))}
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 700,
                        fill: "#1A1A1A",
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
