"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  InputValues,
  CalculationResults,
  Module13Inputs,
  Module13Output,
  calculate340BImpact,
} from "@/lib/calculations";

// ─── Formatters ───────────────────────────────────────────────────────────────

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usdM = (v: number) => {
  const m = v / 1_000_000;
  return `$${m.toFixed(2)}M`;
};

function fmtPct(v: number, d = 1) {
  return `${(v * 100).toFixed(d)}%`;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_M13: Module13Inputs = {
  baseline340BShare: 0.12,
  elasticityCoefficient: 0.15,
  contractPharmacyGrowthRate: 0.08,
};

// ─── Shared input style ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] " +
  "focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

const labelCls = "block text-xs font-semibold text-gray-600 mb-1";

// ─── Tooltip component for input labels ───────────────────────────────────────

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative ml-1 inline-block align-middle">
      <button
        type="button"
        className="w-4 h-4 rounded-full bg-[#0A4747]/15 text-[#0A4747] text-[10px] font-bold leading-none flex items-center justify-center hover:bg-[#0A4747]/30 transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        aria-label="More info"
      >
        ?
      </button>
      {show && (
        <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg bg-[#1A1A1A] px-3 py-2 text-xs text-white shadow-xl">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1A1A1A]" />
        </span>
      )}
    </span>
  );
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  highlight = false,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  delta?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1 ${
        highlight
          ? "border-[#C9A86A]/40 bg-[#C9A86A]/8"
          : "border-gray-100 bg-white"
      }`}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold leading-tight ${
          highlight ? "text-[#C9A86A]" : "text-[#1A1A1A]"
        }`}
      >
        {value}
      </p>
      {delta && (
        <p className="text-sm font-semibold text-[#C9A86A]">{delta}</p>
      )}
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Custom Tooltip for charts ────────────────────────────────────────────────

function ChartTooltipShare({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-[#0A4747] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {(p.value * 100).toFixed(2)}%
        </p>
      ))}
    </div>
  );
}

function ChartTooltipBar({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-[#0A4747] mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: ${(p.value / 1000).toFixed(0)}K
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Module13Props {
  inputs: InputValues;
  results: CalculationResults;
}

export default function Module13_340BImpact({ inputs, results }: Module13Props) {
  const [m13, setM13] = useState<Module13Inputs>(DEFAULT_M13);

  // Draft strings for controlled inputs
  const [draftBaseline, setDraftBaseline] = useState(
    String(DEFAULT_M13.baseline340BShare * 100)
  );
  const [draftElasticity, setDraftElasticity] = useState(
    String(DEFAULT_M13.elasticityCoefficient)
  );
  const [draftGrowth, setDraftGrowth] = useState(
    String(DEFAULT_M13.contractPharmacyGrowthRate * 100)
  );

  function resetToDefaults() {
    setM13(DEFAULT_M13);
    setDraftBaseline(String(DEFAULT_M13.baseline340BShare * 100));
    setDraftElasticity(String(DEFAULT_M13.elasticityCoefficient));
    setDraftGrowth(String(DEFAULT_M13.contractPharmacyGrowthRate * 100));
  }

  function applyBaseline(s: string) {
    const v = parseFloat(s);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      setM13((prev) => ({ ...prev, baseline340BShare: v / 100 }));
    }
  }

  function applyElasticity(s: string) {
    const v = parseFloat(s);
    if (!isNaN(v) && v >= 0 && v <= 2) {
      setM13((prev) => ({ ...prev, elasticityCoefficient: v }));
    }
  }

  function applyGrowth(s: string) {
    const v = parseFloat(s);
    if (!isNaN(v) && v >= 0 && v <= 100) {
      setM13((prev) => ({ ...prev, contractPharmacyGrowthRate: v / 100 }));
    }
  }

  const output: Module13Output = useMemo(
    () => calculate340BImpact(inputs, m13, 3),
    [inputs, m13]
  );

  // Chart data: 340B share over years
  const shareChartData = output.yearByYear.map((d) => ({
    name: `Y${d.year}`,
    share: d.projectedShare,
    baseline: m13.baseline340BShare,
  }));

  // Chart data: stacked bar — base 340B discount pool vs incremental cannibalization
  const barChartData = output.yearByYear.map((d) => ({
    name: `Y${d.year}`,
    "Base 340B Cost": Math.round(d.base340BRevenueLoss),
    "Incremental Cannibalization": Math.round(d.yearCannibalization),
  }));

  // Insight callout numbers
  const rebatePct = inputs.commercialRebatePercentage;
  const baselinePct = (m13.baseline340BShare * 100).toFixed(1);
  const projectedPct = (output.projectedShare * 100).toFixed(1);
  const cannibM = (output.totalCannibalization / 1_000_000).toFixed(2);
  const grossCommSavings3yr =
    (inputs.wac * (inputs.commercialRebatePercentage / 100)) *
    inputs.commercialVolume *
    3;
  const cannibPct =
    grossCommSavings3yr > 0
      ? ((output.totalCannibalization / grossCommSavings3yr) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-[#0A4747] px-6 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">
            Module 13 · 340B Entity-Level Modeling
          </h3>
          <p className="text-xs text-[#C9A86A] mt-0.5">
            Ceiling price impact, covered-entity volume shift &amp; cannibalization
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Cross-module reconciliation badge */}
          <span className="text-xs text-white/70">
            Module 1 ceiling:{" "}
            <span className="font-semibold text-[#C9A86A]">
              {usd2.format(results.price340B)}
            </span>
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white">
            42 USC §256b
          </span>
        </div>
      </div>

      {/* ── Inputs Panel ───────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-[#0A4747] uppercase tracking-wider">
            Modeling Assumptions
          </h4>
          <button
            onClick={resetToDefaults}
            className="text-xs px-3 py-1.5 rounded-lg border border-[#0A4747]/30 text-[#0A4747] hover:bg-[#0A4747]/5 transition-colors font-semibold"
          >
            Reset to defaults
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* Baseline 340B Share */}
          <div>
            <label className={labelCls}>
              Baseline 340B Share %
            </label>
            <input
              type="number"
              min={0}
              max={40}
              step={0.5}
              value={draftBaseline}
              onChange={(e) => setDraftBaseline(e.target.value)}
              onBlur={(e) => applyBaseline(e.target.value)}
              className={inputCls}
            />
            <input
              type="range"
              min={0}
              max={40}
              step={0.5}
              value={m13.baseline340BShare * 100}
              onChange={(e) => {
                const v = e.target.value;
                setDraftBaseline(v);
                applyBaseline(v);
              }}
              className="w-full mt-2 accent-[#0A4747]"
            />
            <p className="text-xs text-gray-400 mt-1">
              Current: {(m13.baseline340BShare * 100).toFixed(1)}%
            </p>
          </div>

          {/* Elasticity Coefficient */}
          <div>
            <label className={labelCls}>
              Elasticity Coefficient (k)
              <InfoTooltip text="Higher = covered entities shift to 340B faster as commercial rebate deepens and the ceiling price falls below commercial net." />
            </label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.01}
              value={draftElasticity}
              onChange={(e) => setDraftElasticity(e.target.value)}
              onBlur={(e) => applyElasticity(e.target.value)}
              className={inputCls}
            />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={m13.elasticityCoefficient}
              onChange={(e) => {
                const v = e.target.value;
                setDraftElasticity(v);
                applyElasticity(v);
              }}
              className="w-full mt-2 accent-[#0A4747]"
            />
            <p className="text-xs text-gray-400 mt-1">
              Current: {m13.elasticityCoefficient.toFixed(2)}
            </p>
          </div>

          {/* Contract Pharmacy Growth Rate */}
          <div>
            <label className={labelCls}>
              Contract Pharmacy Growth Rate %
              <InfoTooltip text="Annual % growth in 340B contract pharmacy footprint — secular expansion of 340B-eligible dispensing points independent of pricing dynamics." />
            </label>
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={draftGrowth}
              onChange={(e) => setDraftGrowth(e.target.value)}
              onBlur={(e) => applyGrowth(e.target.value)}
              className={inputCls}
            />
            <input
              type="range"
              min={0}
              max={30}
              step={0.5}
              value={m13.contractPharmacyGrowthRate * 100}
              onChange={(e) => {
                const v = e.target.value;
                setDraftGrowth(v);
                applyGrowth(v);
              }}
              className="w-full mt-2 accent-[#0A4747]"
            />
            <p className="text-xs text-gray-400 mt-1">
              Current: {(m13.contractPharmacyGrowthRate * 100).toFixed(1)}%/yr
            </p>
          </div>
        </div>
      </div>

      {/* ── Output Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="340B Ceiling Price"
          value={usd2.format(output.ceiling340B)}
          sub="computed from AMP − URA"
        />
        <MetricCard
          label="340B Share Shift"
          value={`${baselinePct}% → ${projectedPct}%`}
          sub="over 3-year horizon"
          delta={`+${((output.projectedShare - m13.baseline340BShare) * 100).toFixed(1)} pp`}
        />
        <MetricCard
          label="Per-Unit Revenue Lost"
          value={usd2.format(output.perUnitLoss)}
          sub="WAC minus 340B ceiling"
        />
        <MetricCard
          label="Total 3-Year Cannibalization"
          value={usdM(output.totalCannibalization)}
          sub="incremental 340B volume × discount depth"
          highlight
        />
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-6">
        {/* Line Chart: 340B share over years */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h4 className="text-xs font-bold text-[#0A4747] uppercase tracking-wider mb-4">
            340B Share Trajectory (Y0 – Y3)
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={shareChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                tick={{ fontSize: 11, fill: "#6b7280" }}
                domain={["auto", "auto"]}
              />
              <Tooltip content={<ChartTooltipShare />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Line
                type="monotone"
                dataKey="baseline"
                name="Baseline share"
                stroke="#9ca3af"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="share"
                name="Projected share"
                stroke="#0A4747"
                strokeWidth={2.5}
                dot={{ fill: "#C9A86A", r: 5, strokeWidth: 2, stroke: "#C9A86A" }}
                activeDot={{ r: 7, fill: "#C9A86A" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Bar Chart: stacked base 340B cost + incremental cannibalization */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h4 className="text-xs font-bold text-[#0A4747] uppercase tracking-wider mb-4">
            340B Discount Pool by Year
          </h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
                tick={{ fontSize: 11, fill: "#6b7280" }}
              />
              <Tooltip content={<ChartTooltipBar />} />
              <Legend
                iconType="square"
                iconSize={8}
                wrapperStyle={{ fontSize: 11 }}
              />
              <Bar
                dataKey="Base 340B Cost"
                stackId="a"
                fill="#0A4747"
                radius={[0, 0, 4, 4]}
              />
              <Bar
                dataKey="Incremental Cannibalization"
                stackId="a"
                fill="#C9A86A"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Insight Callout ─────────────────────────────────────────────── */}
      <div
        className="rounded-xl border-l-4 border-[#C9A86A] bg-[#FAF7F2] px-6 py-4"
        style={{ borderColor: "#C9A86A" }}
      >
        <p className="text-xs font-bold text-[#0A4747] uppercase tracking-wider mb-2">
          Strategic Insight
        </p>
        <p className="text-sm text-[#1A1A1A] leading-relaxed">
          At{" "}
          <span className="font-semibold text-[#0A4747]">{rebatePct}%</span>{" "}
          commercial rebate, 340B share grows from{" "}
          <span className="font-semibold text-[#0A4747]">{baselinePct}%</span> to{" "}
          <span className="font-semibold text-[#C9A86A]">{projectedPct}%</span> over 3 years.
          This cannibalizes{" "}
          <span className="font-semibold text-[#C9A86A]">${cannibM}M</span> — equivalent to{" "}
          <span className="font-semibold text-[#0A4747]">{cannibPct}%</span> of the gross
          commercial savings from the rebate over the same period.
        </p>

        {/* Year-by-year table */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#C9A86A]/30">
                <th className="text-left py-1.5 pr-4 font-semibold text-gray-500">Year</th>
                <th className="text-right py-1.5 px-4 font-semibold text-gray-500">340B Ceiling</th>
                <th className="text-right py-1.5 px-4 font-semibold text-gray-500">Projected Share</th>
                <th className="text-right py-1.5 px-4 font-semibold text-gray-500">Share Shift</th>
                <th className="text-right py-1.5 px-4 font-semibold text-gray-500">Incr. Volume</th>
                <th className="text-right py-1.5 pl-4 font-semibold text-gray-500">Cannibalization</th>
              </tr>
            </thead>
            <tbody>
              {output.yearByYear.map((d) => (
                <tr
                  key={d.year}
                  className="border-b border-gray-100 last:border-0 hover:bg-[#C9A86A]/5"
                >
                  <td className="py-1.5 pr-4 font-semibold text-[#0A4747]">Y{d.year}</td>
                  <td className="text-right py-1.5 px-4 text-[#1A1A1A]">
                    {usd2.format(d.ceiling340B)}
                  </td>
                  <td className="text-right py-1.5 px-4 text-[#1A1A1A]">
                    {fmtPct(d.projectedShare)}
                  </td>
                  <td className="text-right py-1.5 px-4">
                    <span
                      className={
                        d.shareShift > 0
                          ? "text-[#C9A86A] font-semibold"
                          : "text-gray-500"
                      }
                    >
                      {d.shareShift >= 0 ? "+" : ""}
                      {fmtPct(d.shareShift)}
                    </span>
                  </td>
                  <td className="text-right py-1.5 px-4 text-[#1A1A1A]">
                    {Math.round(d.incrementalVolume).toLocaleString()}
                  </td>
                  <td className="text-right py-1.5 pl-4 font-semibold">
                    <span className={d.yearCannibalization > 0 ? "text-[#C9A86A]" : "text-gray-400"}>
                      {d.yearCannibalization > 0
                        ? `$${(d.yearCannibalization / 1000).toFixed(0)}K`
                        : "—"}
                    </span>
                  </td>
                </tr>
              ))}
              <tr className="bg-[#0A4747]/5 font-semibold">
                <td className="py-1.5 pr-4 text-[#0A4747]" colSpan={5}>
                  3-Year Total Cannibalization
                </td>
                <td className="text-right py-1.5 pl-4 text-[#C9A86A]">
                  {usdM(output.totalCannibalization)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Citation Footer ─────────────────────────────────────────────── */}
      <p className="text-xs text-gray-400 text-center pb-1">
        340B Ceiling Price per{" "}
        <span className="font-medium">42 USC §256b(a)(1)</span>. URA per{" "}
        <span className="font-medium">42 CFR 447.505</span>.
        Elasticity model is illustrative; not a legal or regulatory determination.
      </p>
    </div>
  );
}
