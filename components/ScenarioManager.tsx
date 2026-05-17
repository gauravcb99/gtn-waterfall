"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InputValues, CalculationResults } from "@/lib/calculations";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SavedScenario {
  id: string;
  name: string;
  inputs: InputValues;
  results: CalculationResults;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

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

const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const MAX_SCENARIOS = 5;

// ─── Mini chart tooltip ───────────────────────────────────────────────────────

function MiniTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-lg p-2.5 text-xs">
      <p className="font-semibold text-[#0A4747] mb-1">{label}</p>
      <p className="text-[#1A1A1A]">{usd.format(payload[0].value)}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ScenarioManagerProps {
  currentInputs: InputValues;
  currentResults: CalculationResults;
  scenarios: SavedScenario[];
  onSave: (name: string) => void;
  onLoad: (inputs: InputValues) => void;
  onRemove: (id: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScenarioManager({
  currentInputs,
  currentResults,
  scenarios,
  onSave,
  onLoad,
  onRemove,
}: ScenarioManagerProps) {
  const [scenarioName, setScenarioName] = useState("");
  const [limitWarning, setLimitWarning] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  function handleSave() {
    if (scenarios.length >= MAX_SCENARIOS) {
      setLimitWarning(true);
      return;
    }
    setLimitWarning(false);
    const name = scenarioName.trim() || `Scenario ${scenarios.length + 1}`;
    onSave(name);
    setScenarioName("");
  }

  // Pre-compute min/max indices for highlight logic
  const exposures = scenarios.map((s) => s.results.incrementalMedicaidExposure);
  const gtnSpreads = scenarios.map((s) => s.results.gtnSpreadPercentage);

  const minExposureIdx = exposures.length
    ? exposures.indexOf(Math.min(...exposures))
    : -1;
  const maxExposureIdx = exposures.length
    ? exposures.indexOf(Math.max(...exposures))
    : -1;
  const minGTNIdx = gtnSpreads.length
    ? gtnSpreads.indexOf(Math.min(...gtnSpreads))
    : -1;
  const maxGTNIdx = gtnSpreads.length
    ? gtnSpreads.indexOf(Math.max(...gtnSpreads))
    : -1;

  // Only highlight when there are at least 2 scenarios with different values
  const multipleExposures = new Set(exposures).size > 1;
  const multipleGTN = new Set(gtnSpreads).size > 1;

  function exposureCellClass(i: number) {
    if (!multipleExposures) return "";
    if (i === minExposureIdx) return "bg-[#22C55E] text-white font-semibold";
    if (i === maxExposureIdx) return "bg-[#C9A86A] text-white font-semibold";
    return "";
  }

  function gtnCellClass(i: number) {
    if (!multipleGTN) return "";
    if (i === minGTNIdx) return "bg-[#22C55E] text-white font-semibold";
    if (i === maxGTNIdx) return "bg-[#C9A86A] text-white font-semibold";
    return "";
  }

  // Rows definition
  const rows: {
    label: string;
    render: (s: SavedScenario, i: number) => React.ReactNode;
    alt?: boolean;
  }[] = [
    {
      label: "Drug Name",
      render: (s) => <span className="font-medium text-[#1A1A1A]">{s.inputs.drugName}</span>,
    },
    {
      label: "WAC",
      render: (s) => usd2.format(s.inputs.wac),
      alt: true,
    },
    {
      label: "Commercial Rebate %",
      render: (s) => `${s.inputs.commercialRebatePercentage}%`,
    },
    {
      label: "Commercial Net Price",
      render: (s) => usd2.format(s.results.commercialNetPrice),
      alt: true,
    },
    {
      label: "Best Price Triggered",
      render: (s) =>
        s.results.bestPriceTriggered ? (
          <span className="inline-block rounded-full bg-[#C9A86A]/20 text-[#92400E] text-xs font-semibold px-2.5 py-0.5">
            YES
          </span>
        ) : (
          <span className="inline-block rounded-full bg-[#0A4747]/10 text-[#0A4747] text-xs font-semibold px-2.5 py-0.5">
            NO
          </span>
        ),
    },
    {
      label: "Old Medicaid Rebate/Unit",
      render: (s) => usd2.format(s.results.oldMedicaidRebatePerUnit),
      alt: true,
    },
    {
      label: "New Medicaid Rebate/Unit",
      render: (s) => usd2.format(s.results.newMedicaidRebatePerUnit),
    },
    {
      label: "Incremental Medicaid Exposure",
      render: (s, i) => (
        <span className={`px-2 py-0.5 rounded ${exposureCellClass(i)}`}>
          {usd.format(s.results.incrementalMedicaidExposure)}
        </span>
      ),
      alt: true,
    },
    {
      label: "Commercial Net Revenue",
      render: (s) => usd.format(s.results.commercialNetRevenue),
    },
    {
      label: "Medicaid Net Revenue",
      render: (s) => usd.format(s.results.medicaidNetRevenue),
      alt: true,
    },
    {
      label: "340B Net Revenue",
      render: (s) => usd.format(s.results.netRevenue340B),
    },
    {
      label: "Total Net Revenue",
      render: (s) => (
        <span className="font-semibold text-[#0A4747]">
          {usd.format(s.results.totalNetRevenue)}
        </span>
      ),
      alt: true,
    },
    {
      label: "GTN Spread",
      render: (s, i) => (
        <span className={`px-2 py-0.5 rounded ${gtnCellClass(i)}`}>
          {s.results.gtnSpreadPercentage.toFixed(1)}%
        </span>
      ),
    },
  ];

  // Mini chart data
  const chartData = scenarios.map((s) => ({
    name: s.name,
    exposure: s.results.incrementalMedicaidExposure,
  }));

  const chartMax =
    chartData.length > 0
      ? Math.max(...chartData.map((d) => d.exposure)) * 1.25
      : 1;

  return (
    <div className="flex flex-col gap-3">
      {/* ── Save Scenario Bar ──────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-[#0A4747] mb-3">
          Save &amp; Compare Scenarios
        </h3>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => {
              setScenarioName(e.target.value);
              if (limitWarning) setLimitWarning(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="e.g., Aggressive PBM Deal"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors"
          />
          <button
            onClick={handleSave}
            className="shrink-0 rounded-xl bg-[#0A4747] px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all"
          >
            Save Scenario
          </button>
        </div>

        {limitWarning && (
          <p className="text-xs text-[#92400E] mt-2 font-medium">
            Maximum {MAX_SCENARIOS} scenarios. Remove one to save a new one.
          </p>
        )}

        {/* Current inputs preview */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-500">
            WAC {usd2.format(currentInputs.wac)}
          </span>
          <span className="text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-500">
            Rebate {currentInputs.commercialRebatePercentage}%
          </span>
          <span className="text-xs bg-gray-50 border border-gray-100 rounded px-2 py-1 text-gray-500">
            Net {usd2.format(currentResults.commercialNetPrice)}
          </span>
          <span
            className={`text-xs border rounded px-2 py-1 font-medium ${
              currentResults.bestPriceTriggered
                ? "bg-[#C9A86A]/10 border-[#C9A86A]/40 text-[#92400E]"
                : "bg-[#0A4747]/5 border-[#0A4747]/20 text-[#0A4747]"
            }`}
          >
            {currentResults.bestPriceTriggered ? "Cascade triggered" : "No cascade"}
          </span>
        </div>
      </div>

      {/* ── Collapsible Saved Scenarios Panel ─────────────────────── */}
      {scenarios.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {/* Collapsible header */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setPanelOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#0A4747]">
                Saved Scenarios ({scenarios.length})
              </span>
              <span className="text-xs bg-[#0A4747]/10 text-[#0A4747] rounded-full px-2 py-0.5 font-semibold">
                {scenarios.length} / {MAX_SCENARIOS}
              </span>
            </div>
            {panelOpen ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {panelOpen && (
            <div className="border-t border-gray-100">
              {/* Comparison Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-[#0A4747]">
                      {/* Metric label column */}
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#C9A86A] whitespace-nowrap w-44 min-w-[176px]">
                        Metric
                      </th>
                      {scenarios.map((s) => (
                        <th
                          key={s.id}
                          className="px-3 py-2 text-center whitespace-nowrap min-w-[140px]"
                        >
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="text-xs font-semibold text-white leading-tight max-w-[130px] truncate" title={s.name}>
                              {s.name}
                            </span>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => onLoad(s.inputs)}
                                className="text-[10px] font-semibold bg-[#C9A86A] text-[#0A4747] rounded px-2 py-0.5 hover:bg-[#C9A86A]/80 transition-colors"
                              >
                                Load
                              </button>
                              <button
                                onClick={() => onRemove(s.id)}
                                className="text-[10px] font-semibold text-red-300 hover:text-red-200 px-1.5 py-0.5 rounded transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className={`border-b border-gray-50 ${
                          row.alt ? "bg-[#FAF7F2]/60" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-500 whitespace-nowrap">
                          {row.label}
                        </td>
                        {scenarios.map((s, i) => (
                          <td
                            key={s.id}
                            className="px-3 py-2.5 text-center text-sm text-[#1A1A1A]"
                          >
                            {row.render(s, i)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mini Chart */}
              {scenarios.length > 0 && (
                <div className="px-4 pb-5 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                    Incremental Medicaid Exposure by Scenario
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 20, right: 16, left: 16, bottom: 5 }}
                      barCategoryGap="30%"
                    >
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
                          fontSize: 11,
                          fontFamily: "var(--font-poppins)",
                          fontWeight: 600,
                          fill: "#1A1A1A",
                        }}
                      />
                      <YAxis
                        domain={[0, chartMax]}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => usdCompact.format(v)}
                        tick={{
                          fontSize: 10,
                          fontFamily: "var(--font-poppins)",
                          fill: "#9CA3AF",
                        }}
                        width={60}
                      />
                      <Tooltip
                        content={<MiniTooltip />}
                        cursor={{ fill: "rgba(10,71,71,0.04)" }}
                      />
                      <Bar
                        dataKey="exposure"
                        radius={[4, 4, 0, 0]}
                        isAnimationActive={false}
                      >
                        {chartData.map((d, i) => {
                          let fill = "#0A4747";
                          if (multipleExposures) {
                            if (i === minExposureIdx) fill = "#22C55E";
                            else if (i === maxExposureIdx) fill = "#C9A86A";
                          }
                          return <Cell key={i} fill={fill} />;
                        })}
                        <LabelList
                          dataKey="exposure"
                          position="top"
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          formatter={(v: any) => usdCompact.format(Number(v))}
                          style={{
                            fontSize: 10,
                            fontFamily: "var(--font-poppins)",
                            fontWeight: 600,
                            fill: "#555",
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
