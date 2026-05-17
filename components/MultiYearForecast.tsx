"use client";

import { useState, useMemo } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  InputValues,
  MultiYearForecastInputs,
  MultiYearForecastResults,
  ForecastYearData,
  calculateMultiYearForecast,
} from "@/lib/calculations";
import WaterfallChart from "@/components/WaterfallChart";
import StrategicScenarioComparison from "@/components/StrategicScenarioComparison";

// ─── Formatters ──────────────────────────────────────────────────────────────

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const usdFull = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("en-US");

function fmtPct(v: number, d = 1) {
  return `${v.toFixed(d)}%`;
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─── Default forecast inputs ─────────────────────────────────────────────────

const DEFAULT_FORECAST: MultiYearForecastInputs = {
  forecastYears: 3,
  commercialVolumeGrowthPct: 2,
  medicaidVolumeGrowthPct: 5,
  volume340BGrowthPct: 8,
  medicareVolumeGrowthPct: 3,
  medicareBaseVolume: 0,
  wacIncreasePct: 4,
  commercialRebateEscalationPct: 1,
  cpiRatePct: 2.5,
  iraYear: null,
  iraCeilingPct: 75,
};

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] " +
  "focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

// ─── Section heading ─────────────────────────────────────────────────────────

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-bold text-[#0A4747] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#0A4747]/20">
      {children}
    </h4>
  );
}

// ─── Summary Table ───────────────────────────────────────────────────────────

interface SummaryTableProps {
  years: ForecastYearData[];
}

function SummaryTable({ years }: SummaryTableProps) {
  const colCount = years.length; // 0..N

  const colBg = (n: number) =>
    n === 0 ? "bg-[#FAF7F2]" : n % 2 === 1 ? "bg-white" : "bg-[#FAF7F2]";

  interface Row {
    label: string;
    values: (string | React.ReactNode)[];
    highlight?: (n: number) => boolean;
  }

  const rows: Row[] = [
    {
      label: "WAC",
      values: years.map((y) => usdFull.format(y.wac)),
    },
    {
      label: "Commercial Rebate %",
      values: years.map((y) => fmtPct(y.commercialRebatePct)),
    },
    {
      label: "Total Volume",
      values: years.map((y) => num.format(y.totalVolume)),
    },
    {
      label: "Gross Revenue",
      values: years.map((y) => usdCompact.format(y.grossRevenue)),
    },
    {
      label: "Total Net Revenue",
      values: years.map((y) => usdCompact.format(y.totalNetRevenue)),
    },
    {
      label: "GTN Spread",
      values: years.map((y) => fmtPct(y.gtnSpreadPct)),
      highlight: (n: number) => years[n].gtnSpreadPct > 40,
    },
    {
      label: "Best Price Triggered",
      values: years.map((y) => (
        <span
          key={y.year}
          className={y.bestPriceTriggered ? "font-bold text-[#92400E]" : "text-gray-500"}
        >
          {y.bestPriceTriggered ? "YES" : "NO"}
        </span>
      )),
      highlight: (n: number) => years[n].bestPriceTriggered,
    },
    {
      label: "Incr. Medicaid Exposure",
      values: years.map((y) => usdCompact.format(y.incrementalMedicaidExposure)),
    },
    {
      label: "Inflation Penalty",
      values: years.map((y) =>
        y.inflationPenalty > 0 ? usdCompact.format(y.inflationPenalty) : "—"
      ),
    },
    {
      label: "IRA Impact",
      values: years.map((y) =>
        y.iraImpact > 0 ? usdCompact.format(y.iraImpact) : "N/A"
      ),
    },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-[#0A4747]">
            <th className="text-left px-4 py-3 text-xs font-semibold text-white whitespace-nowrap min-w-[170px]">
              Metric
            </th>
            {years.map((y) => (
              <th
                key={y.year}
                className={`px-4 py-3 text-center text-xs font-semibold text-white whitespace-nowrap min-w-[110px]`}
              >
                {y.year === 0 ? "Year 0 (Current)" : `Year ${y.year}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-gray-100 hover:bg-[#0A4747]/5 transition-colors">
              <td className="px-4 py-2.5 text-xs font-semibold text-gray-700 bg-[#FAF7F2] whitespace-nowrap">
                {row.label}
              </td>
              {years.map((y, ci) => {
                const isHighlighted = row.highlight ? row.highlight(ci) : false;
                return (
                  <td
                    key={y.year}
                    className={`px-4 py-2.5 text-center text-xs font-medium whitespace-nowrap
                      ${colBg(ci)}
                      ${isHighlighted ? "bg-[#C9A86A]/20 font-bold text-[#92400E]" : "text-[#1A1A1A]"}
                    `}
                  >
                    {row.values[ci]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Trajectory Chart ────────────────────────────────────────────────────────

interface TrajectoryChartProps {
  years: ForecastYearData[];
  iraYear: number | null;
}

function TrajectoryChart({ years, iraYear }: TrajectoryChartProps) {
  const chartData = years.map((y) => ({
    name: y.year === 0 ? "Year 0" : `Year ${y.year}`,
    grossRevenue: y.grossRevenue,
    totalNetRevenue: y.totalNetRevenue,
    gtnSpreadPct: parseFloat(y.gtnSpreadPct.toFixed(2)),
  }));

  // Build a nice domain for the revenue axis
  const maxRevenue = Math.max(...years.map((y) => y.grossRevenue));
  const revenueMax = maxRevenue * 1.12;

  const gtnMin = Math.min(...years.map((y) => y.gtnSpreadPct));
  const gtnMax = Math.max(...years.map((y) => y.gtnSpreadPct));
  const gtnDomain: [number, number] = [
    Math.max(0, Math.floor(gtnMin - 3)),
    Math.ceil(gtnMax + 5),
  ];

  return (
    <div style={{ height: 500 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 10 }}>
          <defs>
            <linearGradient id="gtnAreaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C9A86A" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#C9A86A" stopOpacity={0.08} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />

          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fontFamily: "var(--font-poppins)", fontWeight: 600, fill: "#1A1A1A" }}
          />

          {/* Left axis: Revenue */}
          <YAxis
            yAxisId="left"
            orientation="left"
            domain={[0, revenueMax]}
            tickFormatter={(v) => usdCompact.format(v)}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fontFamily: "var(--font-poppins)", fill: "#9CA3AF" }}
            width={70}
          />

          {/* Right axis: GTN % */}
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={gtnDomain}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fontFamily: "var(--font-poppins)", fill: "#C9A86A" }}
            width={50}
          />

          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const gross = payload.find((p) => p.dataKey === "grossRevenue");
              const net = payload.find((p) => p.dataKey === "totalNetRevenue");
              const gtn = payload.find((p) => p.dataKey === "gtnSpreadPct");
              return (
                <div
                  className="rounded-lg bg-white border border-gray-200 shadow-lg p-3 text-xs"
                  style={{ fontFamily: "var(--font-poppins)" }}
                >
                  <p className="font-bold text-[#0A4747] mb-2">{label}</p>
                  {gross && (
                    <p className="text-gray-600">
                      Gross Revenue:{" "}
                      <span className="font-semibold text-[#5BA3A3]">
                        {usdFull.format(Number(gross.value))}
                      </span>
                    </p>
                  )}
                  {net && (
                    <p className="text-gray-600">
                      Net Revenue:{" "}
                      <span className="font-semibold text-[#0A4747]">
                        {usdFull.format(Number(net.value))}
                      </span>
                    </p>
                  )}
                  {gtn && (
                    <p className="text-gray-600 mt-1 border-t pt-1">
                      GTN Spread:{" "}
                      <span className="font-bold text-[#C9A86A]">
                        {Number(gtn.value).toFixed(1)}%
                      </span>
                    </p>
                  )}
                </div>
              );
            }}
          />

          {/* Area for gross revenue — fills with gold gradient */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="grossRevenue"
            fill="url(#gtnAreaGradient)"
            stroke="#5BA3A3"
            strokeWidth={2}
            dot={{ fill: "#5BA3A3", r: 4 }}
            activeDot={{ r: 6 }}
            name="Gross Revenue"
          />

          {/* Area for net revenue — covers the region below with cream, leaving the gold band */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="totalNetRevenue"
            fill="#FAF7F2"
            fillOpacity={1}
            stroke="#0A4747"
            strokeWidth={2.5}
            dot={{ fill: "#0A4747", r: 4 }}
            activeDot={{ r: 6 }}
            name="Net Revenue"
          />

          {/* GTN Spread % on right axis */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="gtnSpreadPct"
            stroke="#C9A86A"
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={{ fill: "#C9A86A", r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
            name="GTN Spread %"
          />

          {/* IRA reference line */}
          {iraYear !== null && (
            <ReferenceLine
              yAxisId="left"
              x={`Year ${iraYear}`}
              stroke="#DC2626"
              strokeWidth={2}
              strokeDasharray="6 3"
              label={{
                value: "IRA Negotiation",
                position: "top",
                fill: "#DC2626",
                fontSize: 11,
                fontFamily: "var(--font-poppins)",
                fontWeight: 600,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Key Insights Panel ───────────────────────────────────────────────────────

interface InsightsPanelProps {
  years: ForecastYearData[];
  iraYear: number | null;
}

function InsightsPanel({ years, iraYear }: InsightsPanelProps) {
  const year0 = years[0];
  const yearN = years[years.length - 1];
  const N = yearN.year;

  const insights: string[] = [];

  // Insight 1: GTN spread change
  const gtnChange = yearN.gtnSpreadPct - year0.gtnSpreadPct;
  insights.push(
    `GTN spread increases from ${fmtPct(year0.gtnSpreadPct)} to ${fmtPct(yearN.gtnSpreadPct)} ` +
      `over ${N} ${N === 1 ? "year" : "years"}, a ${fmtPct(Math.abs(gtnChange))} ` +
      `${gtnChange >= 0 ? "increase" : "decrease"}.`
  );

  // Insight 2: Cumulative incremental Medicaid exposure (Years 1..N)
  const cumulativeMedicaidExposure = years
    .slice(1)
    .reduce((sum, y) => sum + y.incrementalMedicaidExposure, 0);
  if (cumulativeMedicaidExposure > 0) {
    insights.push(
      `Cumulative incremental Medicaid exposure over ${N} ${N === 1 ? "year" : "years"}: ` +
        `${usdFull.format(cumulativeMedicaidExposure)}.`
    );
  }

  // Insight 3: Inflation rebate penalty
  if (yearN.inflationPenalty > 0) {
    const year0Penalty = year0.inflationPenalty;
    insights.push(
      `Inflation rebate penalty grows from ` +
        `${year0Penalty > 0 ? usdFull.format(year0Penalty) : "$0"} in Year 0 to ` +
        `${usdFull.format(yearN.inflationPenalty)} in Year ${N}.`
    );
  }

  // Insight 4: IRA impact
  if (iraYear !== null) {
    const iraYearData = years.find((y) => y.year === iraYear);
    if (iraYearData && iraYearData.iraImpact > 0) {
      insights.push(
        `IRA negotiation in Year ${iraYear} reduces Medicare revenue by ` +
          `${usdFull.format(iraYearData.iraImpact)} annually.`
      );
    }
  }

  // Insight 5: Best Price cascade in future year (only if not triggered in Year 0)
  if (!year0.bestPriceTriggered) {
    const firstCascadeYear = years.slice(1).find((y) => y.bestPriceTriggered);
    if (firstCascadeYear) {
      insights.push(
        `Best Price cascade first triggers in Year ${firstCascadeYear.year} due to rebate escalation.`
      );
    }
  } else {
    insights.push(
      `Best Price cascade is active from Year 0 and remains triggered across all forecast years.`
    );
  }

  return (
    <div
      className="rounded-xl bg-[#FAF7F2] border-l-4 border-[#0A4747] p-5 shadow-sm"
      style={{ borderColor: "#5BA3A3" }}
    >
      <h3 className="text-sm font-bold text-[#0A4747] mb-3 flex items-center gap-2">
        <span className="text-base">💡</span> Key Insights
      </h3>
      <ul className="flex flex-col gap-2">
        {insights.map((insight, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-[#1A1A1A]">
            <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-[#0A4747]/10 flex items-center justify-center text-[10px] font-bold text-[#0A4747]">
              {i + 1}
            </span>
            {insight}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface MultiYearForecastProps {
  inputs: InputValues;
}

export default function MultiYearForecast({ inputs }: MultiYearForecastProps) {
  const [fi, setFi] = useState<MultiYearForecastInputs>(DEFAULT_FORECAST);
  const [results, setResults] = useState<MultiYearForecastResults | null>(null);

  // Local string state for number fields to allow clean editing
  const [raw, setRaw] = useState({
    commercialVolumeGrowthPct: "2",
    medicaidVolumeGrowthPct: "5",
    volume340BGrowthPct: "8",
    medicareVolumeGrowthPct: "3",
    medicareBaseVolume: "0",
    wacIncreasePct: "4",
    commercialRebateEscalationPct: "1",
    cpiRatePct: "2.5",
    iraCeilingPct: "75",
  });

  function updateRaw(field: keyof typeof raw, value: string) {
    setRaw((r) => ({ ...r, [field]: value }));
    const n = parseNum(value);
    setFi((prev) => ({ ...prev, [field]: n }));
    // Clear results when inputs change
    setResults(null);
  }

  function handleGenerate() {
    setResults(calculateMultiYearForecast(inputs, fi));
  }

  const iraYearOptions = ["Never", "1", "2", "3", "4", "5"] as const;
  const iraYearDisplay = fi.iraYear === null ? "Never" : String(fi.iraYear);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Assumptions Form ──────────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-[#0A4747] px-6 py-3">
          <h3 className="text-sm font-semibold text-white">Forecast Assumptions</h3>
          <p className="text-xs text-[#C9A86A] mt-0.5">
            Year 0 baseline is taken from the current drug inputs
          </p>
        </div>

        <div className="p-6">
          {/* Row 1: Forecast Period */}
          <div className="mb-5">
            <GroupHeading>Forecast Period</GroupHeading>
            <div className="w-48">
              <label className={labelCls}>Number of Years to Forecast</label>
              <select
                value={fi.forecastYears}
                onChange={(e) => {
                  setFi((prev) => ({
                    ...prev,
                    forecastYears: Number(e.target.value) as 3 | 4 | 5,
                  }));
                  setResults(null);
                }}
                className={inputCls}
              >
                <option value={3}>3 Years</option>
                <option value={4}>4 Years</option>
                <option value={5}>5 Years</option>
              </select>
            </div>
          </div>

          {/* Row 2: Three assumption groups */}
          <div className="grid grid-cols-3 gap-6">
            {/* Volume Growth */}
            <div>
              <GroupHeading>Volume Growth Assumptions (annual %)</GroupHeading>
              <div className="flex flex-col gap-3">
                {(
                  [
                    ["commercialVolumeGrowthPct", "Commercial Volume Growth %"],
                    ["medicaidVolumeGrowthPct", "Medicaid Volume Growth %"],
                    ["volume340BGrowthPct", "340B Volume Growth %"],
                    ["medicareVolumeGrowthPct", "Medicare Part D Volume Growth %"],
                    ["medicareBaseVolume", "Medicare Part D Base Volume (Year 0)"],
                  ] as [keyof typeof raw, string][]
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className={labelCls}>{label}</label>
                    <input
                      type="number"
                      value={raw[field]}
                      onChange={(e) => updateRaw(field, e.target.value)}
                      onFocus={(e) => {
                        if (e.target.value === "0") e.target.select();
                      }}
                      className={inputCls}
                      step={field === "medicareBaseVolume" ? "1000" : "0.5"}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Pricing Assumptions */}
            <div>
              <GroupHeading>Pricing Assumptions (annual %)</GroupHeading>
              <div className="flex flex-col gap-3">
                {(
                  [
                    ["wacIncreasePct", "Annual WAC Increase %"],
                    ["commercialRebateEscalationPct", "Annual Commercial Rebate Escalation (% pts)"],
                    ["cpiRatePct", "Annual CPI-U Rate %"],
                  ] as [keyof typeof raw, string][]
                ).map(([field, label]) => (
                  <div key={field}>
                    <label className={labelCls}>{label}</label>
                    <input
                      type="number"
                      value={raw[field]}
                      onChange={(e) => updateRaw(field, e.target.value)}
                      onFocus={(e) => {
                        if (e.target.value === "0") e.target.select();
                      }}
                      className={inputCls}
                      step="0.5"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Regulatory Assumptions */}
            <div>
              <GroupHeading>Regulatory Assumptions</GroupHeading>
              <div className="flex flex-col gap-3">
                <div>
                  <label className={labelCls}>IRA Negotiation Kicks In at Year</label>
                  <select
                    value={iraYearDisplay}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFi((prev) => ({
                        ...prev,
                        iraYear: v === "Never" ? null : Number(v),
                      }));
                      setResults(null);
                    }}
                    className={inputCls}
                  >
                    {iraYearOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "Never" ? "Never" : `Year ${opt}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>IRA Price Ceiling % (of AMP)</label>
                  <input
                    type="number"
                    value={raw.iraCeilingPct}
                    onChange={(e) => updateRaw("iraCeilingPct", e.target.value)}
                    onFocus={(e) => {
                      if (e.target.value === "0") e.target.select();
                    }}
                    className={`${inputCls} ${fi.iraYear === null ? "opacity-40" : ""}`}
                    disabled={fi.iraYear === null}
                    step="1"
                  />
                </div>
              </div>

              {/* Context note */}
              <div className="mt-4 p-3 bg-[#0A4747]/5 rounded-lg">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <span className="font-semibold text-[#0A4747]">Note:</span> Year 0 baseline
                  uses current drug inputs. WAC, volumes, and rebate escalate each year per
                  these assumptions.
                </p>
              </div>
            </div>
          </div>

          {/* Generate button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={handleGenerate}
              className="px-8 py-3 bg-[#0A4747] hover:bg-[#0A4747]/90 text-white text-sm font-semibold rounded-lg shadow-sm transition-colors"
            >
              Generate Forecast
            </button>
          </div>
        </div>
      </div>

      {/* ── Results ───────────────────────────────────────────────────── */}
      {results && (
        <>
          {/* Section 0: Strategic Scenario Comparison */}
          <StrategicScenarioComparison inputs={inputs} forecastInputs={fi} />

          {/* Section 1: Year-by-Year Summary Table */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#0A4747] px-6 py-3">
              <h3 className="text-sm font-semibold text-white">
                Year-by-Year Summary
              </h3>
              <p className="text-xs text-[#C9A86A] mt-0.5">
                Cells highlighted in gold indicate GTN spread exceeding 40% or Best Price cascade active
              </p>
            </div>
            <div className="p-4">
              <SummaryTable years={results.years} />
            </div>
          </div>

          {/* Section 2: GTN Trajectory Chart */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#0A4747] px-6 py-3">
              <h3 className="text-sm font-semibold text-white">GTN Trajectory</h3>
              <p className="text-xs text-[#C9A86A] mt-0.5">
                Revenue lines on left axis · GTN Spread % on right axis (dashed gold)
              </p>
            </div>
            <div className="p-6 bg-[#FAF7F2]">
              <TrajectoryChart years={results.years} iraYear={fi.iraYear} />
            </div>

            {/* Chart legend */}
            <div className="px-6 pb-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-[#0A4747]" />
                <span className="text-xs text-gray-500">Total Net Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 bg-[#5BA3A3]" />
                <span className="text-xs text-gray-500">Total Gross Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-0.5 border-t-2 border-dashed border-[#C9A86A]" />
                <span className="text-xs text-gray-500">GTN Spread % (right axis)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-3 rounded-sm bg-[#C9A86A]/25" />
                <span className="text-xs text-gray-500">GTN Erosion Band</span>
              </div>
              {fi.iraYear !== null && (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 border-t-2 border-dashed border-red-600" />
                  <span className="text-xs text-gray-500">IRA Negotiation Year</span>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Waterfall Comparison */}
          <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-[#0A4747] px-6 py-3">
              <h3 className="text-sm font-semibold text-white">
                Waterfall Comparison — Year 0 vs Year {fi.forecastYears}
              </h3>
              <p className="text-xs text-[#C9A86A] mt-0.5">
                Side-by-side GTN waterfall showing how the rebate structure evolves
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-gray-100">
              <div className="bg-white">
                <div className="px-4 pt-4 pb-1 text-center">
                  <span className="inline-block px-3 py-1 bg-[#0A4747]/10 rounded-full text-xs font-semibold text-[#0A4747]">
                    Year 0 — Baseline (WAC: {usdFull.format(results.years[0].wac)})
                  </span>
                </div>
                <WaterfallChart results={results.years[0].cascadeResults} />
              </div>
              <div className="bg-white">
                <div className="px-4 pt-4 pb-1 text-center">
                  <span className="inline-block px-3 py-1 bg-[#C9A86A]/20 rounded-full text-xs font-semibold text-[#92400E]">
                    Year {fi.forecastYears} — Forecast (WAC:{" "}
                    {usdFull.format(results.years[fi.forecastYears].wac)})
                  </span>
                </div>
                <WaterfallChart results={results.years[fi.forecastYears].cascadeResults} />
              </div>
            </div>
          </div>

          {/* Section 4: Key Insights */}
          <InsightsPanel years={results.years} iraYear={fi.iraYear} />
        </>
      )}
    </div>
  );
}
