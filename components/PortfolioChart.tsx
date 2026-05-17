"use client";

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
  useXAxisScale,
  useYAxisScale,
  Legend,
} from "recharts";
import { InputValues, CalculationResults } from "@/lib/calculations";

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

// ─── Comparative Bar Chart ────────────────────────────────────────────────────

interface ComparativeChartProps {
  drugs: InputValues[];
  resultsList: CalculationResults[];
}

function ComparativeTooltip({
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
    <div className="rounded-lg bg-white border border-gray-200 shadow-lg p-3 text-sm min-w-[160px]">
      <p className="font-semibold text-[#0A4747] mb-2">{label}</p>
      {payload.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any, i: number) => (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-gray-500">{p.name}</span>
            <span className="font-semibold" style={{ color: p.fill }}>
              {usdFull.format(p.value)}
            </span>
          </div>
        )
      )}
    </div>
  );
}

export function ComparativeChart({ drugs, resultsList }: ComparativeChartProps) {
  if (drugs.length === 0) return null;

  const data = drugs.map((drug, i) => ({
    name: drug.drugName || `Drug ${i + 1}`,
    "Gross Revenue": resultsList[i].totalGrossRevenue,
    "Net Revenue": resultsList[i].totalNetRevenue,
  }));

  const maxVal = Math.max(...resultsList.map((r) => r.totalGrossRevenue)) * 1.15;

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="bg-[#0A4747] px-6 py-3">
        <h3 className="text-sm font-semibold text-white">
          Gross vs. Net Revenue — Drug Comparison
        </h3>
        <p className="text-xs text-[#C9A86A] mt-0.5">
          Gap between bars represents total GTN erosion per drug
        </p>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 20, right: 24, left: 20, bottom: 5 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fontFamily: "var(--font-poppins)", fontWeight: 600, fill: "#1A1A1A" }}
            />
            <YAxis
              domain={[0, maxVal]}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => usdCompact.format(v)}
              tick={{ fontSize: 11, fontFamily: "var(--font-poppins)", fill: "#9CA3AF" }}
              width={75}
            />
            <Tooltip content={<ComparativeTooltip />} cursor={{ fill: "rgba(10,71,71,0.04)" }} />
            <Legend
              wrapperStyle={{ fontSize: 12, fontFamily: "var(--font-poppins)", paddingTop: 8 }}
            />
            <Bar dataKey="Gross Revenue" fill="#0A4747" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="Gross Revenue"
                position="top"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => usdCompact.format(Number(v))}
                style={{ fontSize: 10, fill: "#0A4747", fontFamily: "var(--font-poppins)", fontWeight: 600 }}
              />
            </Bar>
            <Bar dataKey="Net Revenue" fill="#C9A86A" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="Net Revenue"
                position="top"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                formatter={(v: any) => usdCompact.format(Number(v))}
                style={{ fontSize: 10, fill: "#92400E", fontFamily: "var(--font-poppins)", fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Aggregate Waterfall Chart ────────────────────────────────────────────────

interface AggregateWaterfallProps {
  resultsList: CalculationResults[];
}

type BarType = "total" | "decrease";

interface WaterfallEntry {
  name: string;
  spacer: number;
  value: number;
  type: BarType;
  displayValue: number;
}

function buildAggregateWaterfallData(resultsList: CalculationResults[]): WaterfallEntry[] {
  const totalGrossRevenue = resultsList.reduce((s, r) => s + r.totalGrossRevenue, 0);
  const commercialRebateTotal = resultsList.reduce((s, r) => s + r.commercialRebateTotal, 0);
  const medicaidRebateTotal = resultsList.reduce((s, r) => s + r.medicaidRebateTotal, 0);
  const totalDiscount340B = resultsList.reduce((s, r) => s + r.totalDiscount340B, 0);
  const totalNetRevenue = resultsList.reduce((s, r) => s + r.totalNetRevenue, 0);

  const afterComm = totalGrossRevenue - commercialRebateTotal;
  const afterMed = afterComm - medicaidRebateTotal;
  const afterB340 = afterMed - totalDiscount340B;

  return [
    { name: "Gross Revenue", spacer: 0, value: totalGrossRevenue, type: "total", displayValue: totalGrossRevenue },
    { name: "Comm. Rebate", spacer: afterComm, value: commercialRebateTotal, type: "decrease", displayValue: commercialRebateTotal },
    { name: "Medicaid Rebate", spacer: afterMed, value: medicaidRebateTotal, type: "decrease", displayValue: medicaidRebateTotal },
    { name: "340B Discount", spacer: afterB340, value: totalDiscount340B, type: "decrease", displayValue: totalDiscount340B },
    { name: "Net Revenue", spacer: 0, value: totalNetRevenue, type: "total", displayValue: totalNetRevenue },
  ];
}

interface AggConnectorLinesProps {
  data: WaterfallEntry[];
}

function AggConnectorLines({ data }: AggConnectorLinesProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xScale = useXAxisScale() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yScale = useYAxisScale() as any;

  if (!xScale || !yScale) return null;
  const bw: number = typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 0;
  if (bw === 0) return null;

  const right = (name: string): number => (xScale(name) as number) + bw;
  const left = (name: string): number => xScale(name) as number;
  const ypx = (v: number): number => yScale(v) as number;
  const top = (d: WaterfallEntry) => ypx(d.spacer + d.value);

  const connectors = [
    { x1: right(data[0].name), y1: top(data[0]), x2: left(data[1].name), y2: top(data[1]) },
    { x1: right(data[1].name), y1: top(data[1]), x2: left(data[2].name), y2: top(data[2]) },
    { x1: right(data[2].name), y1: top(data[2]), x2: left(data[3].name), y2: top(data[3]) },
    { x1: right(data[3].name), y1: top(data[3]), x2: left(data[4].name), y2: top(data[4]) },
  ];

  return (
    <g aria-hidden="true">
      {connectors.map((c, i) => (
        <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2}
          stroke="#999999" strokeWidth={1} strokeDasharray="4 4" />
      ))}
    </g>
  );
}

interface AggBarLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
  index?: number;
  data?: WaterfallEntry[];
}

function AggBarLabel({ x = 0, y = 0, width = 0, index = 0, data = [] }: AggBarLabelProps) {
  const numX = typeof x === "string" ? parseFloat(x) : x;
  const numY = typeof y === "string" ? parseFloat(y) : y;
  const numW = typeof width === "string" ? parseFloat(width) : width;
  const entry = data[index];
  if (!entry) return null;
  return (
    <text
      x={numX + numW / 2}
      y={numY - 7}
      textAnchor="middle"
      fill={entry.type === "total" ? "#0A4747" : "#92400E"}
      fontSize={11}
      fontWeight={600}
      fontFamily="var(--font-poppins)"
    >
      {usdCompact.format(entry.displayValue)}
    </text>
  );
}

function AggTooltip({
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
  const entry = payload.find((p) => (p.payload?.value ?? 0) > 0)?.payload ?? payload[0]?.payload;
  if (!entry) return null;
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-lg p-3 text-sm">
      <p className="font-semibold text-[#0A4747] mb-1">{label}</p>
      <p className="text-[#1A1A1A]">{usdFull.format(entry.displayValue)}</p>
      {entry.type === "decrease" && (
        <p className="text-xs text-gray-400 mt-0.5">Discount / Rebate</p>
      )}
    </div>
  );
}

export function AggregateWaterfall({ resultsList }: AggregateWaterfallProps) {
  if (resultsList.length === 0) return null;

  const data = buildAggregateWaterfallData(resultsList);
  const maxValue = Math.max(...resultsList.map((r) => r.totalGrossRevenue)) * resultsList.length * 1.1;

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      <div className="bg-[#0A4747] px-6 py-3">
        <h3 className="text-sm font-semibold text-white">
          Portfolio GTN Waterfall — Aggregate Gross to Net Bridge
        </h3>
        <p className="text-xs text-[#C9A86A] mt-0.5">
          Combined across all {resultsList.length} drug{resultsList.length !== 1 ? "s" : ""} in portfolio
        </p>
      </div>
      <div className="p-6">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={data} margin={{ top: 32, right: 24, left: 20, bottom: 5 }} barCategoryGap="32%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 12, fontFamily: "var(--font-poppins)", fontWeight: 600, fill: "#1A1A1A" }}
            />
            <YAxis
              domain={[0, maxValue]}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => usdCompact.format(v)}
              tick={{ fontSize: 11, fontFamily: "var(--font-poppins)", fill: "#9CA3AF" }}
              width={75}
            />
            <Tooltip content={<AggTooltip />} cursor={{ fill: "rgba(10,71,71,0.04)" }} />
            <Bar dataKey="spacer" stackId="waterfall" fillOpacity={0} stroke="none" isAnimationActive={false} legendType="none" />
            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((entry, i) => (
                <Cell key={`cell-${i}`} fill={entry.type === "total" ? "#0A4747" : "#C9A86A"} />
              ))}
              <LabelList content={(props) => <AggBarLabel {...props} data={data} />} />
            </Bar>
            <AggConnectorLines data={data} />
          </BarChart>
        </ResponsiveContainer>

        <div className="flex items-center gap-6 mt-2 justify-center">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[#0A4747]" />
            <span className="text-xs text-gray-500">Revenue (Gross / Net)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-[#C9A86A]" />
            <span className="text-xs text-gray-500">Rebates &amp; Discounts</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PortfolioChart (combined export) ────────────────────────────────────────

interface PortfolioChartProps {
  drugs: InputValues[];
  resultsList: CalculationResults[];
}

export default function PortfolioChart({ drugs, resultsList }: PortfolioChartProps) {
  if (drugs.length === 0) return null;
  return (
    <div className="flex flex-col gap-6">
      <ComparativeChart drugs={drugs} resultsList={resultsList} />
      <AggregateWaterfall resultsList={resultsList} />
    </div>
  );
}
