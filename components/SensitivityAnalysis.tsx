"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Target } from "lucide-react";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { calculate, InputValues } from "@/lib/calculations";

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface SensitivityDataPoint {
  rebate: number;
  commercialNetPrice: number;
  incrementalMedicaidExposure: number;
  totalNetRevenue: number;
  cascadeTriggered: boolean;
  gtnSpread: number;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function SensitivityTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || !payload.length) return null;
  const point: SensitivityDataPoint = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-[#0A4747] mb-2" style={{ fontFamily: "Poppins, sans-serif" }}>
        Rebate: {point.rebate}%
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex justify-between gap-6">
          <span className="text-gray-500">Commercial Net Price</span>
          <span className="font-semibold text-[#1A1A1A]">{usd2.format(point.commercialNetPrice)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-gray-500">Incr. Medicaid Exposure</span>
          <span className="font-semibold text-[#C9A86A]">{usd.format(point.incrementalMedicaidExposure)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-gray-500">Total Net Revenue</span>
          <span className="font-semibold text-[#0A4747]">{usd.format(point.totalNetRevenue)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-gray-500">Cascade Triggered</span>
          <span
            className="font-semibold"
            style={{ color: point.cascadeTriggered ? "#EF4444" : "#16A34A" }}
          >
            {point.cascadeTriggered ? "YES" : "NO"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface SensitivityAnalysisProps {
  inputs: InputValues;
}

export default function SensitivityAnalysis({ inputs }: SensitivityAnalysisProps) {
  const [isOpen, setIsOpen] = useState(false);

  // ── Calculate all 81 data points (0–80%) ─────────────────────────────────
  const { chartData, triggerRebate, safeRebateCeiling } = useMemo(() => {
    const chartData: SensitivityDataPoint[] = [];
    let triggerRebate = 81; // sentinel: never triggered across 0–80

    for (let rebate = 0; rebate <= 80; rebate++) {
      const result = calculate({ ...inputs, commercialRebatePercentage: rebate });

      chartData.push({
        rebate,
        commercialNetPrice: result.commercialNetPrice,
        incrementalMedicaidExposure: result.incrementalMedicaidExposure,
        totalNetRevenue: result.totalNetRevenue,
        cascadeTriggered: result.bestPriceTriggered,
        gtnSpread: result.gtnSpreadPercentage,
      });

      if (result.bestPriceTriggered && triggerRebate === 81) {
        triggerRebate = rebate;
      }
    }

    // Safe ceiling = highest rebate where cascade is NOT triggered
    // If triggers at 28%, safe ceiling = 27%; if never triggers, safe ceiling = 80
    const safeRebateCeiling = triggerRebate > 80 ? 80 : triggerRebate - 1;

    return { chartData, triggerRebate, safeRebateCeiling };
  }, [inputs]);

  // ── Derived status ────────────────────────────────────────────────────────
  const noCascadeEver = triggerRebate > 80;   // even 80% doesn't trigger
  const cascadeAlways = triggerRebate === 0;  // even 0% triggers

  // ── Summary table rows ────────────────────────────────────────────────────
  const tableRows = useMemo(() => {
    const base = [0, 10, 20, 40, 50, 60, 70, 80];
    const withTrigger =
      !noCascadeEver && !cascadeAlways && !base.includes(triggerRebate)
        ? [...base, triggerRebate].sort((a, b) => a - b)
        : base;
    return withTrigger.map((r) => chartData[r]);
  }, [chartData, triggerRebate, noCascadeEver, cascadeAlways]);

  // ── Collapsed badge text ──────────────────────────────────────────────────
  const badgeText = cascadeAlways
    ? "No safe ceiling"
    : noCascadeEver
    ? "No cascade up to 80%"
    : `Safe ceiling: ${safeRebateCeiling}%`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* ── Toggle header ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C9A86A]/15 flex items-center justify-center">
            <Target className="w-4 h-4 text-[#C9A86A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">
              Sensitivity Analysis — Safe Rebate Ceiling
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              See exactly where the Best Price cascade triggers across rebate levels 0%–80%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && (
            <span
              className="text-xs font-semibold px-2.5 py-1 rounded-full"
              style={{
                color: cascadeAlways ? "#EF4444" : noCascadeEver ? "#16A34A" : "#C9A86A",
                backgroundColor: cascadeAlways
                  ? "rgba(239,68,68,0.1)"
                  : noCascadeEver
                  ? "rgba(22,163,74,0.1)"
                  : "rgba(201,168,106,0.1)",
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
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col gap-5">

          {/* ── Safe Ceiling Card ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-gray-100 bg-[#FAF7F2] px-6 py-5 flex flex-col items-center text-center gap-1">
            {cascadeAlways ? (
              <p className="text-sm font-semibold text-red-600 uppercase tracking-wide">
                No safe ceiling exists — cascade triggers at all rebate levels
              </p>
            ) : noCascadeEver ? (
              <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
                No cascade triggered up to 80% rebate
              </p>
            ) : (
              <>
                <p
                  className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                  style={{ fontFamily: "Poppins, sans-serif" }}
                >
                  Safe Rebate Ceiling
                </p>
                <p
                  className="font-bold tracking-tight"
                  style={{ fontSize: 52, color: "#C9A86A", lineHeight: 1.1, fontFamily: "Poppins, sans-serif" }}
                >
                  {safeRebateCeiling}%
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Maximum commercial rebate before Medicaid Best Price cascade triggers
                </p>
              </>
            )}
          </div>

          {/* ── Dual-axis Chart ────────────────────────────────────────────── */}
          <div style={{ height: 400 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 20, right: 70, bottom: 30, left: 70 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />

                {/* Safe Zone shading */}
                {!cascadeAlways && !noCascadeEver && safeRebateCeiling >= 0 && (
                  <ReferenceArea
                    x1={0}
                    x2={safeRebateCeiling}
                    yAxisId="left"
                    fill="rgba(34, 197, 94, 0.1)"
                    label={{
                      value: "Safe Zone",
                      position: "insideTopLeft",
                      fill: "#16A34A",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "Poppins, sans-serif",
                    }}
                  />
                )}

                {/* Cascade Zone shading */}
                {!cascadeAlways && !noCascadeEver && (
                  <ReferenceArea
                    x1={triggerRebate}
                    x2={80}
                    yAxisId="left"
                    fill="rgba(201, 168, 106, 0.1)"
                    label={{
                      value: "Cascade Zone",
                      position: "insideTopRight",
                      fill: "#C9A86A",
                      fontSize: 11,
                      fontWeight: 700,
                      fontFamily: "Poppins, sans-serif",
                    }}
                  />
                )}

                {/* Cascade trigger vertical line */}
                {!cascadeAlways && !noCascadeEver && (
                  <ReferenceLine
                    x={triggerRebate}
                    yAxisId="left"
                    stroke="#EF4444"
                    strokeDasharray="6 3"
                    strokeWidth={2}
                    label={{
                      value: `CASCADE TRIGGER: ${triggerRebate}%`,
                      position: "top",
                      fill: "#EF4444",
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "Poppins, sans-serif",
                    }}
                  />
                )}

                <XAxis
                  dataKey="rebate"
                  type="number"
                  domain={[0, 80]}
                  ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 11, fill: "#6B7280", fontFamily: "Poppins, sans-serif" }}
                  label={{
                    value: "Commercial Rebate %",
                    position: "insideBottom",
                    offset: -15,
                    fill: "#6B7280",
                    fontSize: 12,
                    fontFamily: "Poppins, sans-serif",
                  }}
                />

                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
                    return `$${v}`;
                  }}
                  tick={{ fontSize: 10, fill: "#C9A86A", fontFamily: "Poppins, sans-serif" }}
                  label={{
                    value: "Incr. Medicaid Exposure",
                    angle: -90,
                    position: "insideLeft",
                    offset: 10,
                    fill: "#C9A86A",
                    fontSize: 11,
                    fontFamily: "Poppins, sans-serif",
                    dy: 80,
                  }}
                  width={72}
                />

                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(v) => {
                    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
                    return `$${v}`;
                  }}
                  tick={{ fontSize: 10, fill: "#0A4747", fontFamily: "Poppins, sans-serif" }}
                  label={{
                    value: "Total Net Revenue",
                    angle: 90,
                    position: "insideRight",
                    offset: 10,
                    fill: "#0A4747",
                    fontSize: 11,
                    fontFamily: "Poppins, sans-serif",
                    dy: -60,
                  }}
                  width={72}
                />

                <Tooltip content={<SensitivityTooltip />} />

                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="line"
                  wrapperStyle={{ fontSize: 12, fontFamily: "Poppins, sans-serif", paddingBottom: 8 }}
                />

                {/* Medicaid exposure line — warm gold */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="incrementalMedicaidExposure"
                  name="Incr. Medicaid Exposure"
                  stroke="#C9A86A"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#C9A86A" }}
                />

                {/* Net revenue line — deep teal */}
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalNetRevenue"
                  name="Total Net Revenue"
                  stroke="#0A4747"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#0A4747" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* ── Summary Breakpoint Table ───────────────────────────────────── */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-[#0A4747] px-4 py-2.5">
              <h3 className="text-sm font-semibold text-white" style={{ fontFamily: "Poppins, sans-serif" }}>
                Key Breakpoints
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Rebate %
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Comm. Net Price
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Cascade
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Incr. Medicaid Exposure
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Total Net Revenue
                    </th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      GTN Spread
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => {
                    const isTriggerRow =
                      !noCascadeEver && !cascadeAlways && row.rebate === triggerRebate;
                    return (
                      <tr
                        key={row.rebate}
                        className="border-b border-gray-50"
                        style={{
                          backgroundColor: isTriggerRow
                            ? "rgba(201, 168, 106, 0.12)"
                            : i % 2 === 0
                            ? "#FFFFFF"
                            : "#FAFAFA",
                        }}
                      >
                        <td className="px-4 py-3 font-semibold text-[#1A1A1A] whitespace-nowrap">
                          {row.rebate}%
                          {isTriggerRow && (
                            <span
                              className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded"
                              style={{
                                color: "#C9A86A",
                                backgroundColor: "rgba(201,168,106,0.2)",
                                fontFamily: "Poppins, sans-serif",
                              }}
                            >
                              TRIGGER
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-[#1A1A1A] whitespace-nowrap">
                          {usd2.format(row.commercialNetPrice)}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded"
                            style={{
                              color: row.cascadeTriggered ? "#DC2626" : "#16A34A",
                              backgroundColor: row.cascadeTriggered
                                ? "rgba(220,38,38,0.08)"
                                : "rgba(22,163,74,0.08)",
                            }}
                          >
                            {row.cascadeTriggered ? "YES" : "NO"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-[#1A1A1A] whitespace-nowrap">
                          {usd.format(row.incrementalMedicaidExposure)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#1A1A1A] whitespace-nowrap">
                          {usd.format(row.totalNetRevenue)}
                        </td>
                        <td className="px-4 py-3 text-right text-[#1A1A1A] whitespace-nowrap">
                          {row.gtnSpread.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
