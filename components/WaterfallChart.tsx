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
} from "recharts";
import { CalculationResults } from "@/lib/calculations";

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

// ─── Types ───────────────────────────────────────────────────────────────────

interface WaterfallChartProps {
  results: CalculationResults;
}

type BarType = "total" | "decrease";

interface WaterfallEntry {
  name: string;
  /** Invisible offset — how far up from $0 the visible bar starts */
  spacer: number;
  /** Height of the visible colored segment */
  value: number;
  type: BarType;
  /** Dollar amount shown in labels and tooltips */
  displayValue: number;
}

// ─── Data builder ────────────────────────────────────────────────────────────

function buildWaterfallData(results: CalculationResults): WaterfallEntry[] {
  const {
    totalGrossRevenue,
    commercialRebateTotal,
    medicaidRebateTotal,
    totalDiscount340B,
    totalNetRevenue,
  } = results;

  // Each deduction bar floats above the running subtotal.
  // spacer = the dollar level where the visible bar STARTS (bottom of colored segment).
  const afterComm   = totalGrossRevenue - commercialRebateTotal;   // 47.5M
  const afterMed    = afterComm         - medicaidRebateTotal;     // 44.5M
  const afterB340   = afterMed          - totalDiscount340B;       // 42.75M

  return [
    {
      name: "Gross Revenue",
      spacer: 0,
      value: totalGrossRevenue,
      type: "total",
      displayValue: totalGrossRevenue,
    },
    {
      name: "Comm. Rebate",
      spacer: afterComm,           // bar floats from $47.5M → $65M
      value: commercialRebateTotal,
      type: "decrease",
      displayValue: commercialRebateTotal,
    },
    {
      name: "Medicaid Rebate",
      spacer: afterMed,            // bar floats from $44.5M → $47.5M
      value: medicaidRebateTotal,
      type: "decrease",
      displayValue: medicaidRebateTotal,
    },
    {
      name: "340B Discount",
      spacer: afterB340,           // bar floats from $42.75M → $44.5M
      value: totalDiscount340B,
      type: "decrease",
      displayValue: totalDiscount340B,
    },
    {
      name: "Net Revenue",
      spacer: 0,
      value: totalNetRevenue,
      type: "total",
      displayValue: totalNetRevenue,
    },
  ];
}

// ─── Connector Lines ─────────────────────────────────────────────────────────
// Rendered as a direct BarChart child — uses Recharts v3 hooks to access
// the actual scale functions, which already embed the SVG offset.

interface ConnectorLinesProps {
  data: WaterfallEntry[];
}

function ConnectorLines({ data }: ConnectorLinesProps) {
  // useXAxisScale returns the d3 band scale (callable, has .bandwidth())
  // useYAxisScale returns the d3 linear scale
  // Both return absolute SVG coordinates — no extra translate needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const xScale = useXAxisScale() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const yScale = useYAxisScale() as any;

  if (!xScale || !yScale) return null;

  const bw: number =
    typeof xScale.bandwidth === "function" ? xScale.bandwidth() : 0;
  if (bw === 0) return null;

  // Helper: absolute x of bar's right edge
  const right = (name: string): number => (xScale(name) as number) + bw;
  // Helper: absolute x of bar's left edge
  const left  = (name: string): number =>  xScale(name) as number;
  // Helper: absolute y at a given dollar value
  const ypx   = (v: number): number    => yScale(v) as number;

  // Each connector runs from the top-right of bar[i] to the top-left of bar[i+1].
  // "top" = spacer + value (the uppermost pixel of the visible colored segment).
  //
  // Gross → Comm   : $65M → $65M  (horizontal — both tops at same level)
  // Comm  → Med    : $65M → $47.5M (diagonal step down)
  // Med   → 340B   : $47.5M → $44.5M (diagonal step down)
  // 340B  → Net    : $44.5M → $42.75M (diagonal step down)
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
        <line
          key={i}
          x1={c.x1}
          y1={c.y1}
          x2={c.x2}
          y2={c.y2}
          stroke="#999999"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}
    </g>
  );
}

// ─── Bar Label ───────────────────────────────────────────────────────────────
// Attached to the VALUE bar via LabelList — receives the bar's pixel coords.

interface BarLabelProps {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
  index?: number;
  data?: WaterfallEntry[];
}

function BarLabel({ x = 0, y = 0, width = 0, index = 0, data = [] }: BarLabelProps) {
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

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipPayload {
  payload?: WaterfallEntry;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  // Both the spacer bar and the value bar share the same underlying WaterfallEntry,
  // so we filter to only display once using the value bar payload (non-zero value).
  const entry = payload.find((p) => (p.payload?.value ?? 0) > 0)?.payload
    ?? payload[0]?.payload;
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

// ─── Main export ─────────────────────────────────────────────────────────────

export default function WaterfallChart({ results }: WaterfallChartProps) {
  const data = buildWaterfallData(results);
  // Add 10% headroom above the gross revenue bar so labels don't clip
  const maxValue = results.totalGrossRevenue * 1.1;

  return (
    <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
      {/* Header */}
      <div className="bg-[#0A4747] px-6 py-3">
        <h3 className="text-sm font-semibold text-white">
          GTN Waterfall — Gross to Net Revenue Bridge
        </h3>
        <p className="text-xs text-[#C9A86A] mt-0.5">
          All values in total dollars across channel volumes
        </p>
      </div>

      <div className="p-6">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart
            data={data}
            margin={{ top: 32, right: 24, left: 20, bottom: 5 }}
            barCategoryGap="32%"
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
                fontSize: 12,
                fontFamily: "var(--font-poppins)",
                fontWeight: 600,
                fill: "#1A1A1A",
              }}
            />
            <YAxis
              domain={[0, maxValue]}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => usdCompact.format(v)}
              tick={{
                fontSize: 11,
                fontFamily: "var(--font-poppins)",
                fill: "#9CA3AF",
              }}
              width={75}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "rgba(10,71,71,0.04)" }}
            />

            {/*
              SPACER BAR — invisible offset that pushes each deduction bar
              up to the correct starting dollar level.
              fillOpacity=0 + stroke=none ensures it is completely invisible.
            */}
            <Bar
              dataKey="spacer"
              stackId="waterfall"
              fillOpacity={0}
              stroke="none"
              isAnimationActive={false}
              legendType="none"
            />

            {/*
              VALUE BAR — the visible colored segment stacked on top of the spacer.
              Teal for total bars, warm gold for deductions.
            */}
            <Bar
              dataKey="value"
              stackId="waterfall"
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            >
              {data.map((entry, i) => (
                <Cell
                  key={`cell-${i}`}
                  fill={entry.type === "total" ? "#0A4747" : "#C9A86A"}
                />
              ))}
              <LabelList
                content={(props) => <BarLabel {...props} data={data} />}
              />
            </Bar>

            {/*
              CONNECTOR LINES — dashed horizontal lines bridging adjacent bars
              to make the cascade visually explicit.
              Rendered as a direct BarChart child; uses Recharts v3 hooks
              to read the live scale coordinates.
            */}
            <ConnectorLines data={data} />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
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
