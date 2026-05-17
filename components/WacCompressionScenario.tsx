"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, TrendingDown } from "lucide-react";
import {
  InputValues,
  CalculationResults,
  WacCompressionInputs,
  WacCompressionResults,
  calculateWacCompression,
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

// ─── Sub-components ──────────────────────────────────────────────────────────

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

function CompressionCard({
  label,
  origTotal,
  newTotal,
  compression,
}: {
  label: string;
  origTotal: number;
  newTotal: number;
  compression: number;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">{label}</p>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Original</span>
          <span className="font-semibold text-[#1A1A1A]">{usd.format(origTotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">New</span>
          <span className="font-semibold text-[#1A1A1A]">{usd.format(newTotal)}</span>
        </div>
        <div className="h-px bg-gray-100 my-0.5" />
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Compressed</span>
          <span className="font-semibold text-[#C9A86A]">-{usd.format(compression)}</span>
        </div>
      </div>
    </div>
  );
}

function ChangeCell({ original, updated }: { original: number; updated: number }) {
  const delta = updated - original;
  const sign = delta >= 0 ? "+" : "-";
  const color = delta < 0 ? "text-red-600" : "text-emerald-600";
  return (
    <span className={`font-semibold ${color}`}>
      {sign}{usd.format(Math.abs(delta))}
    </span>
  );
}

function PctChangeCell({ original, updated }: { original: number; updated: number }) {
  const delta = updated - original;
  const sign = delta >= 0 ? "+" : "";
  const color = delta > 0 ? "text-red-600" : "text-emerald-600";
  return (
    <span className={`font-semibold ${color}`}>
      {sign}{delta.toFixed(1)}pp
    </span>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function selectOnZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface WacCompressionScenarioProps {
  inputs: InputValues;
  results: CalculationResults;
}

// Draft strings — store display values as strings so the field can be fully cleared
interface CompressionDrafts {
  newWac: string;
  distributionFeePct: string;
  accessFeePct: string;
  wholesalerMarginPct: string;
}

const DEFAULT_DRAFTS: CompressionDrafts = {
  newWac: "850",
  distributionFeePct: "6",
  accessFeePct: "3",
  wholesalerMarginPct: "4",
};

export default function WacCompressionScenario({
  inputs,
  results,
}: WacCompressionScenarioProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [drafts, setDrafts] = useState<CompressionDrafts>(DEFAULT_DRAFTS);

  // Derive numeric inputs from the draft strings for calculations
  const compressionInputs: WacCompressionInputs = {
    newWac: parseNum(drafts.newWac),
    distributionFeePct: parseNum(drafts.distributionFeePct),
    accessFeePct: parseNum(drafts.accessFeePct),
    wholesalerMarginPct: parseNum(drafts.wholesalerMarginPct),
  };

  const newWacIsValid =
    compressionInputs.newWac > 0 && compressionInputs.newWac < inputs.wac;

  const compressionResults: WacCompressionResults | null = newWacIsValid
    ? calculateWacCompression(inputs, compressionInputs, results)
    : null;

  function setField(key: keyof CompressionDrafts, raw: string) {
    setDrafts((prev) => ({ ...prev, [key]: raw }));
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#C9A86A]/15 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-[#C9A86A]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A4747]">Model a WAC Reduction</p>
            <p className="text-xs text-gray-400 mt-0.5">
              WAC Compression Scenario — See how distribution fees and margins compress proportionally
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isOpen && compressionResults && (
            <span className="text-xs font-semibold text-[#C9A86A] bg-[#C9A86A]/10 px-2.5 py-1 rounded-full">
              -{usd.format(compressionResults.totalEcosystemDollarsRemoved)} ecosystem impact
            </span>
          )}
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-[#0A4747] transition-colors" />
          )}
        </div>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div className="border-t border-gray-100 px-6 py-5 flex flex-col gap-5">
          {/* Inputs row */}
          <div className="grid grid-cols-4 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                New WAC / Unit
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min={1}
                  max={inputs.wac - 1}
                  className={`${inputClass} pl-6`}
                  value={drafts.newWac}
                  onChange={(e) => setField("newWac", e.target.value)}
                  onFocus={selectOnZero}
                />
              </div>
              {!newWacIsValid && compressionInputs.newWac > 0 && (
                <span className="text-xs text-red-500">Must be less than current WAC ({usd2.format(inputs.wac)})</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Distribution Fee %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={`${inputClass} pr-7`}
                  value={drafts.distributionFeePct}
                  onChange={(e) => setField("distributionFeePct", e.target.value)}
                  onFocus={selectOnZero}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Access Fee %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={`${inputClass} pr-7`}
                  value={drafts.accessFeePct}
                  onChange={(e) => setField("accessFeePct", e.target.value)}
                  onFocus={selectOnZero}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
                Wholesaler Margin %
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  className={`${inputClass} pr-7`}
                  value={drafts.wholesalerMarginPct}
                  onChange={(e) => setField("wholesalerMarginPct", e.target.value)}
                  onFocus={selectOnZero}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>

          {/* Results — only show when valid */}
          {compressionResults && (
            <>
              {/* Alert banner */}
              <div className="flex items-start gap-3 rounded-xl bg-[#C9A86A]/12 border border-[#C9A86A]/60 px-4 py-3">
                <TrendingDown className="w-5 h-5 text-[#C9A86A] shrink-0 mt-0.5" />
                <p className="text-sm font-semibold text-[#0A4747]">
                  WAC REDUCTION OF {usd2.format(compressionResults.wacReduction)} PER UNIT REMOVES{" "}
                  <span className="text-[#C9A86A]">
                    {usd.format(compressionResults.totalEcosystemDollarsRemoved)}
                  </span>{" "}
                  FROM THE ECOSYSTEM
                </p>
              </div>

              {/* Three comparison cards */}
              <div className="grid grid-cols-3 gap-4">
                <CompressionCard
                  label="Distribution Fee Impact"
                  origTotal={compressionResults.origDistFeeTotal}
                  newTotal={compressionResults.newDistFeeTotal}
                  compression={compressionResults.totalDistCompression}
                />
                <CompressionCard
                  label="Access Fee Impact"
                  origTotal={compressionResults.origAccessFeeTotal}
                  newTotal={compressionResults.newAccessFeeTotal}
                  compression={compressionResults.totalAccessCompression}
                />
                <CompressionCard
                  label="Wholesaler Margin Impact"
                  origTotal={compressionResults.origWholesalerTotal}
                  newTotal={compressionResults.newWholesalerTotal}
                  compression={compressionResults.totalWholesalerCompression}
                />
              </div>

              {/* Comparison table */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="bg-[#0A4747] px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-white">
                    Scenario Comparison
                  </h3>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Metric
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Original WAC ({usd2.format(inputs.wac)})
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        New WAC ({usd2.format(compressionInputs.newWac)})
                      </th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-3 text-[#1A1A1A]">Net Revenue</td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(results.totalNetRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.newWacResults.totalNetRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeCell
                          original={results.totalNetRevenue}
                          updated={compressionResults.newWacResults.totalNetRevenue}
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-3 text-[#1A1A1A]">GTN Spread</td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {results.gtnSpreadPercentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {compressionResults.newWacResults.gtnSpreadPercentage.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right">
                        <PctChangeCell
                          original={results.gtnSpreadPercentage}
                          updated={compressionResults.newWacResults.gtnSpreadPercentage}
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-3 text-[#1A1A1A]">Distribution Fees</td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.origDistFeeTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.newDistFeeTotal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeCell
                          original={compressionResults.origDistFeeTotal}
                          updated={compressionResults.newDistFeeTotal}
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-3 text-[#1A1A1A]">Access Fees</td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.origAccessFeeTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.newAccessFeeTotal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeCell
                          original={compressionResults.origAccessFeeTotal}
                          updated={compressionResults.newAccessFeeTotal}
                        />
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-[#1A1A1A]">Wholesaler Margin</td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.origWholesalerTotal)}
                      </td>
                      <td className="px-4 py-3 text-right text-[#1A1A1A]">
                        {usd.format(compressionResults.newWholesalerTotal)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChangeCell
                          original={compressionResults.origWholesalerTotal}
                          updated={compressionResults.newWholesalerTotal}
                        />
                      </td>
                    </tr>
                    {/* Total Ecosystem Impact row */}
                    <tr className="bg-[#0A4747]">
                      <td className="px-4 py-3.5 font-semibold text-[#C9A86A] uppercase text-xs tracking-wide">
                        Total Ecosystem Impact
                      </td>
                      <td className="px-4 py-3.5 text-right text-white/40 text-xs">—</td>
                      <td className="px-4 py-3.5 text-right text-white/40 text-xs">—</td>
                      <td className="px-4 py-3.5 text-right">
                        <span className="text-xl font-semibold text-white">
                          -{usd.format(compressionResults.totalEcosystemDollarsRemoved)}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Invalid state placeholder */}
          {!newWacIsValid && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 flex items-center justify-center">
              <p className="text-sm text-gray-400">
                Enter a New WAC less than the current WAC ({usd2.format(inputs.wac)}) to see results.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
