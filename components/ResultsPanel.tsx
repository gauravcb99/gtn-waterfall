"use client";

import { CalculationResults, InputValues } from "@/lib/calculations";
import { TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

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

const num = new Intl.NumberFormat("en-US");

function MetricCard({
  label,
  value,
  highlight,
  large,
  showArrow,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  large?: boolean;
  showArrow?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-1 border ${
        highlight
          ? "bg-[#0A4747] border-[#0A4747] text-white"
          : "bg-white border-gray-100"
      }`}
    >
      <span
        className={`text-xs font-semibold uppercase tracking-wide ${
          highlight ? "text-[#C9A86A]" : "text-gray-500"
        }`}
      >
        {label}
      </span>
      <div className="flex items-center gap-2">
        <span
          className={`font-semibold leading-tight ${
            large ? "text-2xl" : "text-xl"
          } ${highlight ? "text-white" : "text-[#0A4747]"}`}
        >
          {value}
        </span>
        {showArrow && (
          <TrendingUp
            className={`w-5 h-5 ${highlight ? "text-[#C9A86A]" : "text-[#C9A86A]"}`}
          />
        )}
      </div>
    </div>
  );
}

interface ResultsPanelProps {
  results: CalculationResults;
  inputs: InputValues;
}

export default function ResultsPanel({ results, inputs }: ResultsPanelProps) {
  const {
    bestPriceTriggered,
    commercialNetPrice,
    oldMedicaidRebatePerUnit,
    newMedicaidRebatePerUnit,
    incrementalMedicaidExposure,
    commercialNetRevenue,
    medicaidNetRevenue,
    netRevenue340B,
    totalNetRevenue,
    totalGrossRevenue,
    gtnSpreadPercentage,
    medicaidNetPrice,
    price340B,
  } = results;

  const { commercialVolume, medicaidVolume, volume340B, currentBestPrice } = inputs;
  const rebateIncreased = newMedicaidRebatePerUnit > oldMedicaidRebatePerUnit;

  return (
    <div className="flex flex-col gap-5">
      {/* Alert Banner */}
      {bestPriceTriggered ? (
        <div className="flex items-start gap-3 rounded-xl bg-[#C9A86A]/15 border border-[#C9A86A] p-4">
          <AlertTriangle className="w-5 h-5 text-[#C9A86A] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">
              BEST PRICE CASCADE TRIGGERED
            </p>
            <p className="text-sm text-ink mt-0.5">
              Your commercial rebate decision has reset the statutory Medicaid Best
              Price. Incremental exposure:{" "}
              <span className="font-semibold text-[#0A4747]">
                {usd.format(incrementalMedicaidExposure)}
              </span>
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl bg-[#0A4747]/8 border border-[#0A4747]/30 p-4">
          <CheckCircle className="w-5 h-5 text-[#0A4747] shrink-0 mt-0.5" />
          <p className="text-sm text-ink">
            <span className="font-semibold text-[#0A4747]">
              No Best Price cascade.
            </span>{" "}
            Commercial net price ({usd2.format(commercialNetPrice)}) remains above
            current Best Price ({usd2.format(currentBestPrice)}).
          </p>
        </div>
      )}

      {/* Metric Cards 2x2 */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Commercial Net Price"
          value={usd2.format(commercialNetPrice)}
        />
        <MetricCard
          label="Old Medicaid Rebate / Unit"
          value={usd2.format(oldMedicaidRebatePerUnit)}
        />
        <MetricCard
          label="New Medicaid Rebate / Unit"
          value={usd2.format(newMedicaidRebatePerUnit)}
          showArrow={rebateIncreased}
        />
        <MetricCard
          label="Incremental Medicaid Exposure"
          value={usd.format(incrementalMedicaidExposure)}
          highlight
          large
        />
      </div>

      {/* Revenue Breakdown Table */}
      <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
        <div className="bg-[#0A4747] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-white">Revenue by Channel</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Channel
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Volume
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Net Price / Unit
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Net Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="px-4 py-3 text-ink">Commercial</td>
              <td className="px-4 py-3 text-right text-ink">{num.format(commercialVolume)}</td>
              <td className="px-4 py-3 text-right text-ink">{usd2.format(commercialNetPrice)}</td>
              <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                {usd.format(commercialNetRevenue)}
              </td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="px-4 py-3 text-ink">Medicaid</td>
              <td className="px-4 py-3 text-right text-ink">{num.format(medicaidVolume)}</td>
              <td className="px-4 py-3 text-right text-ink">{usd2.format(medicaidNetPrice)}</td>
              <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                {usd.format(medicaidNetRevenue)}
              </td>
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-4 py-3 text-ink">340B</td>
              <td className="px-4 py-3 text-right text-ink">{num.format(volume340B)}</td>
              <td className="px-4 py-3 text-right text-ink">{usd2.format(price340B)}</td>
              <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                {usd.format(netRevenue340B)}
              </td>
            </tr>
            <tr className="bg-[#0A4747]/5">
              <td className="px-4 py-3 font-semibold text-[#0A4747]">TOTAL</td>
              <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                {num.format(commercialVolume + medicaidVolume + volume340B)}
              </td>
              <td className="px-4 py-3 text-right text-gray-400 text-xs">—</td>
              <td className="px-4 py-3 text-right font-semibold text-[#0A4747]">
                {usd.format(totalNetRevenue)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* GTN Summary */}
      <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-3">
        <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
          <span className="text-gray-500">Total Gross Revenue at WAC</span>
          <span className="font-semibold text-ink">{usd.format(totalGrossRevenue)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">Total Net Revenue</span>
          <span className="font-semibold text-ink">{usd.format(totalNetRevenue)}</span>
        </div>
        <div className="flex justify-between items-center mt-1 rounded-lg bg-[#0A4747] px-4 py-3">
          <span className="text-sm font-semibold text-[#C9A86A] uppercase tracking-wide">
            GTN Spread
          </span>
          <span className="text-2xl font-semibold text-white">
            {gtnSpreadPercentage.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
