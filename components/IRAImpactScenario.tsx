"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Pill } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  InputValues,
  CalculationResults,
  IRAImpactInputs,
  IRAImpactResults,
  calculateIRAImpact,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function selectOnZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  highlight = false,
  sub,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-4 flex flex-col gap-1.5 ${
        highlight
          ? "border-[#C9A86A]/50 bg-[#C9A86A]/8"
          : "border-gray-100 bg-white"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
        {label}
      </p>
      <p
        className={`text-lg font-bold ${
          highlight ? "text-[#C9A86A]" : "text-[#1A1A1A]"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-md px-3 py-2 text-sm">
      <p className="font-semibold text-[#1A1A1A]">{label}</p>
      <p className="text-[#0A4747] font-bold">{usd.format(payload[0].value)}</p>
    </div>
  );
}

// ─── Draft state type ─────────────────────────────────────────────────────────

interface IRADrafts {
  yearsOnMarket: string;
  nonFederalAMP: string;
  medicarePartDVolume: string;
  medicarePartDRebatePct: string;
  catastrophicDiscountPct: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface IRAImpactScenarioProps {
  inputs: InputValues;
  results: CalculationResults;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function IRAImpactScenario({
  inputs,
  results,
}: IRAImpactScenarioProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ampOverridden, setAmpOverridden] = useState(false);

  const [drafts, setDrafts] = useState<IRADrafts>({
    yearsOnMarket: "10",
    nonFederalAMP: String(results.amp),
    medicarePartDVolume: "15000",
    medicarePartDRebatePct: "20",
    catastrophicDiscountPct: "20",
  });

  // Keep nonFederalAMP in sync with the main calc unless user has overridden it
  useEffect(() => {
    if (!ampOverridden) {
      setDrafts((prev) => ({ ...prev, nonFederalAMP: String(results.amp) }));
    }
  }, [results.amp, ampOverridden]);

  function setField(key: keyof IRADrafts, raw: string) {
    if (key === "nonFederalAMP") setAmpOverridden(true);
    setDrafts((prev) => ({ ...prev, [key]: raw }));
  }

  // Parse drafts to numbers for calculation
  const parsedInputs: IRAImpactInputs = {
    yearsOnMarket: parseNum(drafts.yearsOnMarket),
    nonFederalAMP: parseNum(drafts.nonFederalAMP),
    medicarePartDVolume: parseNum(drafts.medicarePartDVolume),
    medicarePartDRebatePct: parseNum(drafts.medicarePartDRebatePct),
    catastrophicDiscountPct: parseNum(drafts.catastrophicDiscountPct),
  };

  const iraResults: IRAImpactResults = calculateIRAImpact(
    parsedInputs,
    inputs.wac,
    results.totalNetRevenue
  );

  const ceilingLabel =
    iraResults.ceilingPct === 0.75
      ? "75%"
      : iraResults.ceilingPct === 0.60
      ? "60%"
      : "40%";

  const chartData = [
    {
      name: "Current Medicare Revenue",
      value: iraResults.currentMedicareRevenue,
    },
    {
      name: "Post-IRA Medicare Revenue",
      value: iraResults.newMedicareRevenue,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* ── Toggle header ─────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0A4747]/10 flex items-center justify-center">
            <Pill className="w-4 h-4 text-[#0A4747]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">
              Model IRA Negotiation Impact
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              IRA Negotiation Impact Layer — Medicare price ceiling and revenue compression
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span className="text-xs font-semibold text-[#C9A86A] bg-[#C9A86A]/10 px-2.5 py-1 rounded-full">
              -{usd.format(iraResults.totalIRAImpact)} total IRA impact
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          )}
        </div>
      </button>

      {/* ── Collapsible body ──────────────────────────────────────── */}
      {isOpen && (
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col gap-5">
          {/* ── Input row ────────────────────────────────────────── */}
          <div className="grid grid-cols-5 gap-4">
            {/* Years on Market */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Years on Market
              </label>
              <input
                type="number"
                min={0}
                step={1}
                className={inputClass}
                value={drafts.yearsOnMarket}
                onChange={(e) => setField("yearsOnMarket", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>

            {/* Non-Federal AMP */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Non-Federal AMP / Unit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  $
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  className={`${inputClass} pl-6`}
                  value={drafts.nonFederalAMP}
                  onChange={(e) => setField("nonFederalAMP", e.target.value)}
                  onFocus={selectOnZero}
                />
              </div>
              {!ampOverridden && (
                <span className="text-xs text-gray-400">
                  From main inputs ({usd2.format(results.amp)})
                </span>
              )}
            </div>

            {/* Medicare Part D Volume */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Medicare Part D Volume
              </label>
              <input
                type="number"
                min={0}
                step={100}
                className={inputClass}
                value={drafts.medicarePartDVolume}
                onChange={(e) => setField("medicarePartDVolume", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>

            {/* Medicare Rebate % */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Medicare Part D Rebate %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={`${inputClass} pr-7`}
                  value={drafts.medicarePartDRebatePct}
                  onChange={(e) =>
                    setField("medicarePartDRebatePct", e.target.value)
                  }
                  onFocus={selectOnZero}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  %
                </span>
              </div>
            </div>

            {/* Catastrophic Phase Discount */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Mfr Catastrophic Discount %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={`${inputClass} pr-7`}
                  value={drafts.catastrophicDiscountPct}
                  onChange={(e) =>
                    setField("catastrophicDiscountPct", e.target.value)
                  }
                  onFocus={selectOnZero}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* ── Alert banner ─────────────────────────────────────── */}
          {iraResults.alreadyBelowCeiling ? (
            <div className="flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
              <Pill className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-emerald-800">
                Current Medicare net price ({usd2.format(iraResults.currentMedicareNetPrice)}) is
                already below the IRA ceiling ({usd2.format(iraResults.iraPriceCeiling)}).
                Negotiation would not reduce the price further.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl bg-[#0A4747] border border-[#0A4747] px-4 py-3">
              <Pill className="w-5 h-5 text-[#C9A86A] shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-white">
                IRA NEGOTIATION IMPACT: Medicare price reduction of{" "}
                <span className="text-[#C9A86A]">
                  {usd2.format(iraResults.priceReductionPerUnit)}
                </span>{" "}
                per unit. Total annual impact:{" "}
                <span className="text-[#C9A86A]">
                  {usd.format(iraResults.totalIRAImpact)}
                </span>
              </p>
            </div>
          )}

          {/* ── 5 Metric Cards ───────────────────────────────────── */}
          <div className="grid grid-cols-5 gap-4">
            <MetricCard
              label="IRA Price Ceiling"
              value={usd2.format(iraResults.iraPriceCeiling)}
              sub={`${ceilingLabel} of Non-Federal AMP`}
            />
            <MetricCard
              label="Current Medicare Net Price"
              value={usd2.format(iraResults.currentMedicareNetPrice)}
            />
            <MetricCard
              label="IRA Negotiated Price"
              value={usd2.format(iraResults.iraNegotiatedPrice)}
              highlight={!iraResults.alreadyBelowCeiling}
            />
            <MetricCard
              label="Per-Unit Price Reduction"
              value={usd2.format(iraResults.priceReductionPerUnit)}
            />
            <MetricCard
              label="Total Annual IRA Impact"
              value={usd.format(iraResults.totalIRAImpact)}
              highlight
            />
          </div>

          {/* ── Detailed breakdown table ──────────────────────────── */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-[#0A4747] px-4 py-2.5">
              <h3 className="text-sm font-semibold text-white">
                IRA Negotiation Detailed Breakdown
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 w-1/2">
                    Metric
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    label: "Years on Market",
                    value: `${parsedInputs.yearsOnMarket}`,
                  },
                  {
                    label: "Applicable Ceiling",
                    value: ceilingLabel,
                  },
                  {
                    label: "Non-Federal AMP",
                    value: usd2.format(parsedInputs.nonFederalAMP),
                  },
                  {
                    label: "IRA Price Ceiling",
                    value: usd2.format(iraResults.iraPriceCeiling),
                  },
                  {
                    label: "Current Medicare Net Price",
                    value: usd2.format(iraResults.currentMedicareNetPrice),
                  },
                  {
                    label: "IRA Negotiated Price",
                    value: usd2.format(iraResults.iraNegotiatedPrice),
                  },
                  {
                    label: "Price Reduction per Unit",
                    value: usd2.format(iraResults.priceReductionPerUnit),
                  },
                  {
                    label: "Medicare Part D Volume",
                    value: parsedInputs.medicarePartDVolume.toLocaleString(),
                  },
                  {
                    label: "Revenue Impact (Price Reduction)",
                    value: usd.format(iraResults.totalMedicareRevenueImpact),
                  },
                  {
                    label: "Catastrophic Phase Liability (est.)",
                    value: usd.format(iraResults.totalCatastrophicLiability),
                  },
                ].map(({ label, value }) => (
                  <tr key={label} className="border-b border-gray-50">
                    <td className="px-4 py-3 text-[#1A1A1A]">{label}</td>
                    <td className="px-4 py-3 text-right font-semibold text-[#1A1A1A]">
                      {value}
                    </td>
                  </tr>
                ))}
                {/* TOTAL row */}
                <tr className="bg-[#0A4747]">
                  <td className="px-4 py-3.5 font-semibold text-[#C9A86A] uppercase text-xs tracking-wide">
                    TOTAL IRA IMPACT
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-xl font-bold text-white">
                      {usd.format(iraResults.totalIRAImpact)}
                    </span>
                  </td>
                </tr>
                {/* Impact as % of Net Revenue */}
                <tr className="border-b border-gray-50 bg-gray-50">
                  <td className="px-4 py-3 text-[#1A1A1A]">
                    Impact as % of Total Net Revenue
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                    {iraResults.iraImpactAsPctOfNetRevenue.toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Revenue comparison bar chart ──────────────────────── */}
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#0A4747] mb-4">
              Medicare Revenue Comparison
            </p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1_000_000).toFixed(1)}M`}
                  tick={{ fontSize: 11, fill: "#6B7280" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  tick={{ fontSize: 11, fill: "#374151" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={36}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={index === 0 ? "#0A4747" : "#C9A86A"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-6 mt-3">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#0A4747] shrink-0" />
                <span className="text-xs text-gray-500">Current Medicare Revenue</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-[#C9A86A] shrink-0" />
                <span className="text-xs text-gray-500">Post-IRA Medicare Revenue</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
