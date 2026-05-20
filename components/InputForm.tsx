"use client";

import { useEffect, useRef, useState } from "react";
import { InputValues } from "@/lib/calculations";
import { searchCMSDrug, CMSDrugData } from "@/lib/cmsApi";

interface InputFormProps {
  values: InputValues;
  onChange: (values: InputValues) => void;
  onCalculate: () => void;
}

// ─── CMS Badge ───────────────────────────────────────────────────────────────

function CMSBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[#0A4747] px-2 py-0.5 text-[10px] font-semibold text-white ml-1.5 align-middle">
      CMS
    </span>
  );
}

// ─── Field wrapper ────────────────────────────────────────────────────────────

function Field({
  label,
  children,
  hint,
  cms,
  error,
  warning,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  cms?: boolean;
  error?: string;
  warning?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-lg transition-colors ${cms ? "bg-[#E8F5F5] px-2 py-1.5 -mx-2" : ""}`}>
      <label className="text-xs font-semibold uppercase tracking-wide text-[#0A4747]">
        {label}
        {cms && <CMSBadge />}
      </label>
      {children}
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
      {!error && warning && <span className="text-xs text-amber-600">{warning}</span>}
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export default function InputForm({ values, onChange, onCalculate }: InputFormProps) {
  const [drafts, setDrafts] = useState<Drafts>(() => toDrafts(values));

  // ── CMS Search state ────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CMSDrugData[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [medicareNote, setMedicareNote] = useState<string | null>(null);
  const [pendingResult, setPendingResult] = useState<CMSDrugData | null>(null);
  // Tracks which form fields were auto-populated from CMS
  const [cmsFields, setCmsFields] = useState<Set<keyof InputValues>>(new Set());

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync drafts when values change from outside (e.g. scenario load).
  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const key of NUMERIC_KEYS) {
        if (parseNum(prev[key]) !== values[key]) {
          next[key] = String(values[key]);
          changed = true;
        }
      }
      if (prev.drugName !== values.drugName) {
        next.drugName = values.drugName;
        changed = true;
      }

      return changed ? next : prev;
    });
    // When values change externally (scenario load), clear CMS highlights
    setCmsFields(new Set());
  }, [values]);

  function set(key: keyof InputValues, raw: string) {
    // Clear CMS highlight when user manually edits a field
    setCmsFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });

    if (key === "drugName") {
      setDrafts((prev) => ({ ...prev, drugName: raw }));
      onChange({ ...values, drugName: raw });
    } else {
      setDrafts((prev) => ({ ...prev, [key]: raw }));
      onChange({ ...values, [key]: parseNum(raw) });
    }
  }

  // ── Drug search ─────────────────────────────────────────────────────────────

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) return;

    setIsSearching(true);
    setSearchError(null);
    setMedicareNote(null);
    setSearchResults([]);
    setPendingResult(null);

    try {
      const { results, error, medicareError } = await searchCMSDrug(term);

      if (error) {
        setSearchError(error);
      } else {
        setSearchResults(results);
        if (results.length === 1) {
          // Only one result — pre-select it automatically
          setPendingResult(results[0]);
        }
        if (medicareError) {
          setMedicareNote(medicareError);
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "CMS data temporarily unavailable. Please enter data manually.";
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSearch();
  }

  function handleSelectResult(drug: CMSDrugData) {
    setPendingResult(drug);
    setSearchResults([]);
  }

  function handleUseData(drug: CMSDrugData) {
    const populated = new Set<keyof InputValues>();

    const newDrugs: Partial<Drafts> = {
      drugName: drug.drugName,
      wac: String(drug.wacPerUnit),
      ampPercentage: "95", // standard assumption
    };
    populated.add("drugName");
    populated.add("wac");
    populated.add("ampPercentage");

    const newValues: Partial<InputValues> = {
      drugName: drug.drugName,
      wac: drug.wacPerUnit,
      ampPercentage: 95,
    };

    if (drug.medicarePartDVolume !== undefined) {
      newDrugs.medicaidVolume = String(drug.medicarePartDVolume);
      newValues.medicaidVolume = drug.medicarePartDVolume;
      populated.add("medicaidVolume");
    }

    setDrafts((prev) => ({ ...prev, ...newDrugs }));
    onChange({ ...values, ...newValues });
    setCmsFields(populated);
    setPendingResult(null);
    setSearchResults([]);
  }

  function formatDate(raw: string) {
    if (!raw) return "—";
    try {
      return new Date(raw).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return raw;
    }
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  const wacError =
    values.wac <= 0 ? "WAC must be greater than zero" : undefined;

  const rebateError =
    values.commercialRebatePercentage > 100 ? "Rebate cannot exceed 100%" : undefined;

  const commercialVolumeError =
    values.commercialVolume < 0 ? "Volume cannot be negative" : undefined;
  const medicaidVolumeError =
    values.medicaidVolume < 0 ? "Volume cannot be negative" : undefined;
  const volume340BError =
    values.volume340B < 0 ? "Volume cannot be negative" : undefined;

  const totalVolumeError =
    !commercialVolumeError && !medicaidVolumeError && !volume340BError &&
    values.commercialVolume === 0 && values.medicaidVolume === 0 && values.volume340B === 0
      ? "At least one channel must have volume greater than zero"
      : undefined;

  const ampWarning =
    values.ampPercentage > 100
      ? "AMP above 100% means AMP exceeds WAC. Verify this is intentional."
      : undefined;

  const bestPriceWarning =
    values.wac > 0 && values.currentBestPrice > values.wac
      ? "Best Price exceeds WAC. Verify this is intentional."
      : undefined;

  const hasBlockingErrors = !!(
    wacError ||
    rebateError ||
    commercialVolumeError ||
    medicaidVolumeError ||
    volume340BError ||
    totalVolumeError
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-5">
      <div className="border-b border-[#0A4747]/20 pb-3">
        <h2 className="text-lg font-semibold text-[#0A4747]">Model Inputs</h2>
        <p className="text-xs text-gray-500 mt-0.5">Edit any field to recalculate live</p>
      </div>

      {/* ── Drug Search ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white/60 border border-gray-100 p-4 flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Drug Search
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Pull real pricing and volume data from CMS
          </p>
        </div>

        {/* Search input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            {/* Magnifying glass icon */}
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
              <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className={`${inputClass} pl-8`}
              placeholder="Search by drug name or NDC (e.g. semaglutide)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSearching}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchTerm.trim()}
            className="shrink-0 rounded-lg bg-[#0A4747] px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Search CMS Data
          </button>
        </div>

        {/* Loading */}
        {isSearching && (
          <div className="flex items-center gap-2 text-xs text-[#0A4747]">
            <svg
              className="animate-spin h-3.5 w-3.5 text-[#0A4747]"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
              />
            </svg>
            Pulling data from CMS...
          </div>
        )}

        {/* Error */}
        {searchError && !isSearching && (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {searchError}
          </p>
        )}

        {/* Medicare note */}
        {medicareNote && !isSearching && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            {medicareNote}
          </p>
        )}

        {/* Multiple results dropdown */}
        {searchResults.length > 1 && !isSearching && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-gray-500">Multiple results found — select one:</p>
            {searchResults.map((drug) => (
              <button
                key={drug.ndc}
                onClick={() => handleSelectResult(drug)}
                className="text-left rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs hover:border-[#0A4747] hover:bg-[#E8F5F5] transition-colors"
              >
                <span className="font-semibold text-[#0A4747]">{drug.drugName}</span>
                <span className="text-gray-400 ml-2">NDC: {drug.ndc}</span>
              </button>
            ))}
          </div>
        )}

        {/* Result card — shown when one result selected */}
        {pendingResult && !isSearching && (
          <div className="rounded-lg border-l-4 border-[#0A4747] bg-[#F8FAFA] p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-semibold text-[#0A4747]">{pendingResult.drugName}</p>
                <p className="text-xs text-gray-500">NDC: {pendingResult.ndc}</p>
                <p className="text-xs text-gray-500">
                  Source:{" "}
                  <span className="font-medium">{pendingResult.dataSources.join(", ")}</span>
                </p>
                <p className="text-xs text-gray-500">
                  Data as of:{" "}
                  <span className="font-medium">{formatDate(pendingResult.asOfDate)}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-gray-400">NADAC / Unit</p>
                <p className="text-base font-bold text-[#0A4747]">
                  ${pendingResult.wacPerUnit.toFixed(4)}
                </p>
              </div>
            </div>

            {pendingResult.medicarePartDVolume !== undefined && (
              <p className="text-xs text-gray-500">
                Medicare Part D volume (est. quarterly):{" "}
                <span className="font-semibold text-[#0A4747]">
                  {pendingResult.medicarePartDVolume.toLocaleString()} claims
                </span>
              </p>
            )}

            <button
              onClick={() => handleUseData(pendingResult)}
              className="w-full rounded-lg bg-[#0A4747] py-1.5 text-xs font-semibold text-white hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all"
            >
              Use This Data
            </button>

            <p className="text-[10px] text-gray-400 leading-snug">
              Data sourced from CMS NADAC and Medicare Part D Spending Dashboard.
              Verify against your internal records before using in financial models.
            </p>
          </div>
        )}
      </div>

      {/* Drug identification */}
      <Field label="Drug Name" cms={cmsFields.has("drugName")}>
        <input
          type="text"
          className={inputClass}
          value={drafts.drugName}
          onChange={(e) => set("drugName", e.target.value)}
        />
      </Field>

      {/* Pricing */}
      <div className="rounded-xl bg-white/60 border border-gray-100 p-4 flex flex-col gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Pricing</p>

        <Field label="WAC per Unit" hint="Wholesale Acquisition Cost" cms={cmsFields.has("wac")} error={wacError}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              className={`${inputClass} pl-6`}
              value={drafts.wac}
              onChange={(e) => set("wac", e.target.value)}
              onFocus={selectOnZero}
            />
          </div>
        </Field>

        <Field
          label="AMP as % of WAC"
          hint={
            cmsFields.has("ampPercentage")
              ? "Average Manufacturer Price · standard 95% assumption"
              : "Average Manufacturer Price"
          }
          cms={cmsFields.has("ampPercentage")}
          warning={ampWarning}
        >
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={`${inputClass} pr-8`}
              value={drafts.ampPercentage}
              onChange={(e) => set("ampPercentage", e.target.value)}
              onFocus={selectOnZero}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
          </div>
        </Field>

        <Field label="Current Best Price per Unit" warning={bestPriceWarning}>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              min={0}
              className={`${inputClass} pl-6`}
              value={drafts.currentBestPrice}
              onChange={(e) => set("currentBestPrice", e.target.value)}
              onFocus={selectOnZero}
            />
          </div>
        </Field>
      </div>

      {/* Commercial Rebate Slider */}
      <div className="rounded-xl bg-white/60 border border-gray-100 p-4 flex flex-col gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Commercial Deal</p>

        <Field label="Commercial Rebate Percentage" error={rebateError}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={80}
              step={0.5}
              className="flex-1 accent-[#0A4747] h-2 cursor-pointer"
              value={parseNum(drafts.commercialRebatePercentage)}
              onChange={(e) => set("commercialRebatePercentage", e.target.value)}
            />
            <div className="relative w-20 shrink-0">
              <input
                type="number"
                min={0}
                max={80}
                step={0.5}
                className={`${inputClass} pr-6 text-center`}
                value={drafts.commercialRebatePercentage}
                onChange={(e) => set("commercialRebatePercentage", e.target.value)}
                onFocus={selectOnZero}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
        </Field>
      </div>

      {/* Volumes */}
      <div className="rounded-xl bg-white/60 border border-gray-100 p-4 flex flex-col gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Volume (units)</p>

        <Field label="Commercial Volume" error={commercialVolumeError}>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={drafts.commercialVolume}
            onChange={(e) => set("commercialVolume", e.target.value)}
            onFocus={selectOnZero}
          />
        </Field>

        <Field
          label="Medicaid Volume"
          hint={cmsFields.has("medicaidVolume") ? "Estimated from Medicare Part D annual claims ÷ 4" : undefined}
          cms={cmsFields.has("medicaidVolume")}
          error={medicaidVolumeError}
        >
          <input
            type="number"
            min={0}
            className={inputClass}
            value={drafts.medicaidVolume}
            onChange={(e) => set("medicaidVolume", e.target.value)}
            onFocus={selectOnZero}
          />
        </Field>

        <Field label="340B Volume" error={volume340BError ?? totalVolumeError}>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={drafts.volume340B}
            onChange={(e) => set("volume340B", e.target.value)}
            onFocus={selectOnZero}
          />
        </Field>
      </div>

      <button
        onClick={onCalculate}
        disabled={hasBlockingErrors}
        className="w-full rounded-xl bg-[#0A4747] py-3 text-sm font-semibold text-white shadow-md hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Calculate Cascade
      </button>
    </div>
  );
}
