"use client";

import { useEffect, useState } from "react";
import { InputValues, CalculationResults } from "@/lib/calculations";
import { ChevronDown, ChevronUp } from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

const usd2 = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

interface DrugCardProps {
  drug: InputValues;
  results: CalculationResults;
  onUpdate: (updated: InputValues) => void;
  onRemove: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type NumericKey = Exclude<keyof InputValues, "drugName">;
const NUMERIC_KEYS: NumericKey[] = [
  "wac",
  "ampPercentage",
  "currentBestPrice",
  "commercialRebatePercentage",
  "commercialVolume",
  "medicaidVolume",
  "volume340B",
];

interface Drafts {
  drugName: string;
  wac: string;
  ampPercentage: string;
  currentBestPrice: string;
  commercialRebatePercentage: string;
  commercialVolume: string;
  medicaidVolume: string;
  volume340B: string;
}

function toDrafts(v: InputValues): Drafts {
  return {
    drugName: v.drugName,
    wac: String(v.wac),
    ampPercentage: String(v.ampPercentage),
    currentBestPrice: String(v.currentBestPrice),
    commercialRebatePercentage: String(v.commercialRebatePercentage),
    commercialVolume: String(v.commercialVolume),
    medicaidVolume: String(v.medicaidVolume),
    volume340B: String(v.volume340B),
  };
}

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function selectOnZero(e: React.FocusEvent<HTMLInputElement>) {
  if (e.target.value === "0") e.target.select();
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function DrugCard({ drug, results, onUpdate, onRemove }: DrugCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(drug));

  // Sync drafts when the drug prop changes from outside.
  // Only updates a draft field if the parsed draft differs from the new prop value.
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const key of NUMERIC_KEYS) {
        if (parseNum(prev[key]) !== drug[key]) {
          next[key] = String(drug[key]);
          changed = true;
        }
      }
      if (prev.drugName !== drug.drugName) {
        next.drugName = drug.drugName;
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [drug]);

  const triggered = results.bestPriceTriggered;

  function set(key: keyof InputValues, raw: string) {
    if (key === "drugName") {
      setDrafts((prev) => ({ ...prev, drugName: raw }));
      onUpdate({ ...drug, drugName: raw });
    } else {
      setDrafts((prev) => ({ ...prev, [key]: raw }));
      onUpdate({ ...drug, [key]: parseNum(raw) });
    }
  }

  return (
    <div
      className={`rounded-xl border bg-white overflow-hidden transition-all ${
        triggered ? "border-[#C9A86A]" : "border-[#22C55E]"
      }`}
      style={{ borderLeftWidth: 4 }}
    >
      {/* Collapsed header — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Cascade indicator dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            triggered ? "bg-[#C9A86A]" : "bg-[#22C55E]"
          }`}
        />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[#0A4747] truncate">
            {drug.drugName || "Unnamed Drug"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            WAC {usd2.format(drug.wac)} · Rebate {drug.commercialRebatePercentage}%
            {triggered && (
              <span className="ml-2 text-[#C9A86A] font-semibold">CASCADE</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-xs text-red-400 hover:text-red-600 font-medium px-1.5 py-0.5 rounded transition-colors"
          >
            Remove
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded edit form */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 flex flex-col gap-3">
          {/* Drug name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Drug Name
            </label>
            <input
              type="text"
              className={inputClass}
              value={drafts.drugName}
              onChange={(e) => set("drugName", e.target.value)}
            />
          </div>

          {/* Pricing grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                WAC ($)
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={drafts.wac}
                onChange={(e) => set("wac", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                AMP %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                className={inputClass}
                value={drafts.ampPercentage}
                onChange={(e) => set("ampPercentage", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Best Price ($)
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={drafts.currentBestPrice}
                onChange={(e) => set("currentBestPrice", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Comm. Rebate %
              </label>
              <input
                type="number"
                min={0}
                max={80}
                step={0.5}
                className={inputClass}
                value={drafts.commercialRebatePercentage}
                onChange={(e) => set("commercialRebatePercentage", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
          </div>

          {/* Volumes grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Comm. Vol
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={drafts.commercialVolume}
                onChange={(e) => set("commercialVolume", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Medicaid Vol
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={drafts.medicaidVolume}
                onChange={(e) => set("medicaidVolume", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                340B Vol
              </label>
              <input
                type="number"
                min={0}
                className={inputClass}
                value={drafts.volume340B}
                onChange={(e) => set("volume340B", e.target.value)}
                onFocus={selectOnZero}
              />
            </div>
          </div>

          {/* Mini results */}
          <div className="rounded-lg bg-gray-50 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-gray-500">Comm. Net Price</span>
            <span className="font-semibold text-[#0A4747] text-right">{usd2.format(results.commercialNetPrice)}</span>
            <span className="text-gray-500">Old Rebate/Unit</span>
            <span className="font-semibold text-[#0A4747] text-right">{usd2.format(results.oldMedicaidRebatePerUnit)}</span>
            <span className="text-gray-500">New Rebate/Unit</span>
            <span className="font-semibold text-[#0A4747] text-right">{usd2.format(results.newMedicaidRebatePerUnit)}</span>
            <span className="text-gray-500">Incr. Exposure</span>
            <span className={`font-semibold text-right ${triggered ? "text-[#C9A86A]" : "text-[#0A4747]"}`}>
              {usd.format(results.incrementalMedicaidExposure)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
