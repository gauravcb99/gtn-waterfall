"use client";

import { useState, useCallback } from "react";
import { calculate, InputValues, CalculationResults } from "@/lib/calculations";
import { searchCMSDrug, CMSDrugData } from "@/lib/cmsApi";
import PortfolioChart from "@/components/PortfolioChart";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PortfolioDrug extends InputValues {
  ndc: string;
  asOfDate?: string;
}

interface AddFormDraft {
  wac: string;
  ampPercentage: string;
  currentBestPrice: string;
  commercialRebatePercentage: string;
  commercialVolume: string;
  medicaidVolume: string;
  volume340B: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: AddFormDraft = {
  wac: "",
  ampPercentage: "95",
  currentBestPrice: "",
  commercialRebatePercentage: "",
  commercialVolume: "50000",
  medicaidVolume: "10000",
  volume340B: "5000",
};

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

const pct = (n: number) => `${n.toFixed(1)}%`;

function parseNum(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ─── Traffic light logic ──────────────────────────────────────────────────────
// Green  = cascade NOT triggered
// Gold   = cascade triggered AND GTN spread <= 40%
// Red    = cascade triggered AND GTN spread > 40%

function trafficLight(r: CalculationResults): "green" | "gold" | "red" {
  if (!r.bestPriceTriggered) return "green";
  return r.gtnSpreadPercentage <= 40 ? "gold" : "red";
}

// ─── Input class ─────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";

// ─── Component ───────────────────────────────────────────────────────────────

export default function PortfolioView() {
  // ── Portfolio state ────────────────────────────────────────────────────────
  const [drugs, setDrugs] = useState<PortfolioDrug[]>([]);

  // ── CMS search state ───────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CMSDrugData[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pendingCMSDrug, setPendingCMSDrug] = useState<CMSDrugData | null>(null);

  // ── Add-drug form state ────────────────────────────────────────────────────
  const [addForm, setAddForm] = useState<AddFormDraft>(DEFAULT_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Derived results (recalculated whenever drugs array changes) ────────────
  const resultsList: CalculationResults[] = drugs.map((d) => calculate(d));

  // ── Aggregate metrics ──────────────────────────────────────────────────────
  const totalGrossRevenue = resultsList.reduce((s, r) => s + r.totalGrossRevenue, 0);
  const totalNetRevenue = resultsList.reduce((s, r) => s + r.totalNetRevenue, 0);
  const portfolioGTN =
    totalGrossRevenue > 0 ? (1 - totalNetRevenue / totalGrossRevenue) * 100 : 0;
  const totalIncrementalExposure = resultsList.reduce(
    (s, r) => s + r.incrementalMedicaidExposure,
    0
  );
  const drugsAtRisk = resultsList.filter((r) => r.bestPriceTriggered).length;

  // ── CMS search handlers ────────────────────────────────────────────────────

  async function handleSearch() {
    const term = searchTerm.trim();
    if (!term) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setPendingCMSDrug(null);
    setFormError(null);

    try {
      const { results, error } = await searchCMSDrug(term);
      if (error) {
        setSearchError(error);
      } else {
        setSearchResults(results);
        if (results.length === 1) {
          selectDrug(results[0]);
        }
      }
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : "CMS data temporarily unavailable. Please try again."
      );
    } finally {
      setIsSearching(false);
    }
  }

  function selectDrug(drug: CMSDrugData) {
    setPendingCMSDrug(drug);
    setSearchResults([]);
    setAddForm({
      ...DEFAULT_FORM,
      wac: drug.wacPerUnit > 0 ? String(drug.wacPerUnit) : "",
    });
    setFormError(null);
  }

  function cancelAdd() {
    setPendingCMSDrug(null);
    setAddForm(DEFAULT_FORM);
    setFormError(null);
  }

  // ── Add to portfolio ───────────────────────────────────────────────────────

  function handleAddToPortfolio() {
    if (!pendingCMSDrug) return;

    if (!addForm.wac || parseNum(addForm.wac) <= 0) {
      setFormError("WAC Per Unit is required and must be greater than 0.");
      return;
    }
    if (!addForm.currentBestPrice || parseNum(addForm.currentBestPrice) <= 0) {
      setFormError("Current Best Price is required and must be greater than 0.");
      return;
    }
    if (!addForm.commercialRebatePercentage) {
      setFormError("Commercial Rebate % is required.");
      return;
    }
    if (drugs.length >= 10) {
      setFormError("Portfolio is limited to 10 drugs.");
      return;
    }
    if (drugs.some((d) => d.ndc === pendingCMSDrug.ndc)) {
      setFormError("This NDC is already in the portfolio.");
      return;
    }

    const newDrug: PortfolioDrug = {
      ndc: pendingCMSDrug.ndc,
      asOfDate: pendingCMSDrug.asOfDate,
      drugName: pendingCMSDrug.drugName,
      wac: parseNum(addForm.wac),
      ampPercentage: parseNum(addForm.ampPercentage),
      currentBestPrice: parseNum(addForm.currentBestPrice),
      commercialRebatePercentage: parseNum(addForm.commercialRebatePercentage),
      commercialVolume: parseNum(addForm.commercialVolume),
      medicaidVolume: parseNum(addForm.medicaidVolume),
      volume340B: parseNum(addForm.volume340B),
    };

    setDrugs((prev) => [...prev, newDrug]);
    setPendingCMSDrug(null);
    setAddForm(DEFAULT_FORM);
    setFormError(null);
    setSearchTerm("");
  }

  // ── Portfolio mutation helpers ─────────────────────────────────────────────

  const removeDrug = useCallback((index: number) => {
    setDrugs((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateDrugWac = useCallback((index: number, wac: number) => {
    setDrugs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, wac } : d))
    );
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* ── CMS Drug Search + Add Form ──────────────────────────────────────── */}
      <div className="rounded-xl bg-white border border-gray-100 shadow-sm p-5">
        <div className="mb-3">
          <h2 className="text-base font-semibold text-[#0A4747]">Add Drug to Portfolio</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Search CMS NADAC data to pull real pricing, then set your proprietary inputs
          </p>
        </div>

        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
            >
              <circle cx="8.5" cy="8.5" r="5.75" stroke="currentColor" strokeWidth="1.75" />
              <path d="M13 13L17 17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 py-2 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors"
              placeholder="Search by drug name or NDC (e.g. semaglutide, ozempic)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              disabled={isSearching}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchTerm.trim()}
            className="shrink-0 rounded-lg bg-[#0A4747] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSearching ? "Searching..." : "Search CMS"}
          </button>
        </div>

        {/* Loading */}
        {isSearching && (
          <div className="flex items-center gap-2 mt-2 text-xs text-[#0A4747]">
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Pulling data from CMS...
          </div>
        )}

        {/* Search error */}
        {searchError && !isSearching && (
          <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {searchError}
          </p>
        )}

        {/* Multiple results dropdown */}
        {searchResults.length > 1 && !isSearching && (
          <div className="mt-2 flex flex-col gap-1">
            <p className="text-xs text-gray-500">Multiple results found — select one:</p>
            <div className="max-h-52 overflow-y-auto flex flex-col gap-1">
              {searchResults.map((drug) => (
                <button
                  key={drug.ndc}
                  onClick={() => selectDrug(drug)}
                  className="text-left flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 hover:bg-[#E8F5F5] hover:border-[#0A4747]/30 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium text-[#1A1A1A]">{drug.drugName}</span>
                    <span className="ml-2 text-xs text-gray-400">NDC: {drug.ndc}</span>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <span className="text-sm font-semibold text-[#0A4747]">
                      {drug.wacPerUnit > 0 ? usd2.format(drug.wacPerUnit) : "No WAC"}
                    </span>
                    {drug.asOfDate && (
                      <span className="block text-[10px] text-gray-400">
                        as of{" "}
                        {new Date(drug.asOfDate).toLocaleDateString("en-US", {
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Add drug form — shown when a CMS drug is pending */}
        {pendingCMSDrug && (
          <div className="mt-4 rounded-xl border border-[#0A4747]/20 bg-[#E8F5F5] p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#0A4747]">Set Proprietary Inputs</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  CMS-sourced fields are pre-filled and editable
                </p>
              </div>
              <button
                onClick={cancelAdd}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Drug name + NDC — read-only */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  Drug Name{" "}
                  <span className="inline-flex items-center rounded-full bg-[#0A4747] px-1.5 py-0.5 text-[9px] font-semibold text-white ml-1">
                    CMS
                  </span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={pendingCMSDrug.drugName}
                  className="w-full rounded-lg border border-[#0A4747]/20 bg-white/70 px-3 py-2 text-sm text-[#1A1A1A] cursor-default select-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  NDC{" "}
                  <span className="inline-flex items-center rounded-full bg-[#0A4747] px-1.5 py-0.5 text-[9px] font-semibold text-white ml-1">
                    CMS
                  </span>
                </label>
                <input
                  type="text"
                  readOnly
                  value={pendingCMSDrug.ndc}
                  className="w-full rounded-lg border border-[#0A4747]/20 bg-white/70 px-3 py-2 text-sm text-[#1A1A1A] font-mono cursor-default select-none"
                />
              </div>
            </div>

            {/* Pricing grid */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  WAC Per Unit ($){" "}
                  <span className="inline-flex items-center rounded-full bg-[#0A4747] px-1.5 py-0.5 text-[9px] font-semibold text-white ml-1">
                    CMS
                  </span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={addForm.wac}
                  onChange={(e) => setAddForm((f) => ({ ...f, wac: e.target.value }))}
                  placeholder="e.g. 1000.00"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  AMP as % of WAC
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={addForm.ampPercentage}
                  onChange={(e) => setAddForm((f) => ({ ...f, ampPercentage: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  Current Best Price ($){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={addForm.currentBestPrice}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, currentBestPrice: e.target.value }))
                  }
                  placeholder="e.g. 750.00"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  Commercial Rebate %{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  max={80}
                  step={0.5}
                  value={addForm.commercialRebatePercentage}
                  onChange={(e) =>
                    setAddForm((f) => ({
                      ...f,
                      commercialRebatePercentage: e.target.value,
                    }))
                  }
                  placeholder="e.g. 35"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Volume grid */}
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  Commercial Volume
                </label>
                <input
                  type="number"
                  min={0}
                  value={addForm.commercialVolume}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, commercialVolume: e.target.value }))
                  }
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  Medicaid Volume
                </label>
                <input
                  type="number"
                  min={0}
                  value={addForm.medicaidVolume}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, medicaidVolume: e.target.value }))
                  }
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-[#0A4747]">
                  340B Volume
                </label>
                <input
                  type="number"
                  min={0}
                  value={addForm.volume340B}
                  onChange={(e) =>
                    setAddForm((f) => ({ ...f, volume340B: e.target.value }))
                  }
                  className={inputCls}
                />
              </div>
            </div>

            {/* Form validation error */}
            {formError && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">
                {formError}
              </p>
            )}

            <button
              onClick={handleAddToPortfolio}
              className="w-full rounded-xl bg-[#0A4747] py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all"
            >
              + Add to Portfolio
            </button>
          </div>
        )}
      </div>

      {/* ── Portfolio Summary Panel ─────────────────────────────────────────── */}
      {/* id used by PDF export */}
      <div id="pdf-portfolio-summary" className="flex flex-col gap-5">
        {/* 5-card aggregate metrics */}
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Gross Revenue
            </span>
            <span className="text-xl font-semibold text-[#0A4747] leading-tight">
              {usd.format(totalGrossRevenue)}
            </span>
            <span className="text-xs text-gray-400">total portfolio</span>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Net Revenue
            </span>
            <span className="text-xl font-semibold text-[#0A4747] leading-tight">
              {usd.format(totalNetRevenue)}
            </span>
            <span className="text-xs text-gray-400">total portfolio</span>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              GTN Spread
            </span>
            <span className="text-xl font-semibold text-[#0A4747] leading-tight">
              {pct(portfolioGTN)}
            </span>
            <span className="text-xs text-gray-400">weighted avg</span>
          </div>

          <div className="rounded-xl border border-[#0A4747] bg-[#0A4747] p-4 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#C9A86A]">
              Incr. Exposure
            </span>
            <span className="text-xl font-semibold text-white leading-tight">
              {usd.format(totalIncrementalExposure)}
            </span>
            <span className="text-xs text-[#C9A86A]/70">total Medicaid</span>
          </div>

          <div
            className={`rounded-xl border p-4 flex flex-col gap-1 ${
              drugsAtRisk > 0
                ? "bg-[#C9A86A]/15 border-[#C9A86A]"
                : "bg-white border-gray-100"
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wide ${
                drugsAtRisk > 0 ? "text-[#92400E]" : "text-gray-500"
              }`}
            >
              Drugs at Risk
            </span>
            <span
              className={`text-xl font-semibold leading-tight ${
                drugsAtRisk > 0 ? "text-[#92400E]" : "text-[#0A4747]"
              }`}
            >
              {drugsAtRisk}
            </span>
            <span
              className={`text-xs ${
                drugsAtRisk > 0 ? "text-[#92400E]/70" : "text-gray-400"
              }`}
            >
              cascade triggered
            </span>
          </div>
        </div>

        {/* Portfolio table */}
        <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
          <div className="bg-[#0A4747] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Portfolio Analysis</h3>
            <span className="text-xs text-[#C9A86A]">{drugs.length} / 10 drugs</span>
          </div>

          {drugs.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className="text-sm font-medium text-gray-500">No drugs in portfolio yet</p>
              <p className="text-xs text-gray-400 mt-1">
                Search for a drug above and click &quot;+ Add to Portfolio&quot;
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[960px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Drug Name
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      NDC
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      WAC
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Comm. Rebate %
                    </th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      BP Triggered
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Incr. Exposure
                    </th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      GTN Spread
                    </th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      Risk
                    </th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {drugs.map((drug, i) => {
                    const r = resultsList[i];
                    const light = trafficLight(r);
                    return (
                      <tr
                        key={drug.ndc}
                        className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">
                          {drug.drugName}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                          {drug.ndc}
                        </td>
                        {/* WAC — inline editable */}
                        <td className="px-3 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={drug.wac}
                            onChange={(e) => updateDrugWac(i, parseNum(e.target.value))}
                            className="w-24 text-right rounded border border-gray-200 px-2 py-1 text-sm text-[#1A1A1A] focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors"
                          />
                        </td>
                        <td className="px-3 py-3 text-right text-[#1A1A1A]">
                          {drug.commercialRebatePercentage}%
                        </td>
                        <td className="px-3 py-3 text-center">
                          {r.bestPriceTriggered ? (
                            <span className="inline-block rounded-full bg-[#C9A86A]/20 text-[#92400E] text-xs font-semibold px-2.5 py-0.5">
                              YES
                            </span>
                          ) : (
                            <span className="inline-block rounded-full bg-[#0A4747]/10 text-[#0A4747] text-xs font-semibold px-2.5 py-0.5">
                              NO
                            </span>
                          )}
                        </td>
                        <td
                          className={`px-3 py-3 text-right font-semibold ${
                            r.bestPriceTriggered ? "text-[#C9A86A]" : "text-[#0A4747]"
                          }`}
                        >
                          {usd.format(r.incrementalMedicaidExposure)}
                        </td>
                        <td className="px-3 py-3 text-right text-[#1A1A1A]">
                          {pct(r.gtnSpreadPercentage)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div
                            title={
                              light === "green"
                                ? "No cascade triggered"
                                : light === "gold"
                                ? "Cascade triggered — GTN spread acceptable"
                                : "Cascade triggered — GTN spread > 40%"
                            }
                            className={`w-4 h-4 rounded-full mx-auto ${
                              light === "green"
                                ? "bg-green-500"
                                : light === "gold"
                                ? "bg-[#C9A86A]"
                                : "bg-red-500"
                            }`}
                          />
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => removeDrug(i)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium px-1.5 py-0.5 rounded transition-colors"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Portfolio totals row */}
                  <tr className="bg-[#0A4747]/5 border-t border-[#0A4747]/20">
                    <td className="px-4 py-3 font-semibold text-[#0A4747]" colSpan={2}>
                      PORTFOLIO TOTAL
                    </td>
                    <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                    <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs text-gray-400">
                        {drugsAtRisk}/{drugs.length}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[#C9A86A]">
                      {usd.format(totalIncrementalExposure)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-[#0A4747]">
                      {pct(portfolioGTN)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* GTN Revenue Summary */}
        {drugs.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
              <span className="text-gray-500">Total Portfolio Gross Revenue</span>
              <span className="font-semibold text-[#1A1A1A]">{usd.format(totalGrossRevenue)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Total Portfolio Net Revenue</span>
              <span className="font-semibold text-[#1A1A1A]">{usd.format(totalNetRevenue)}</span>
            </div>
            <div className="flex justify-between items-center mt-1 rounded-lg bg-[#0A4747] px-4 py-3">
              <span className="text-sm font-semibold text-[#C9A86A] uppercase tracking-wide">
                Portfolio GTN Spread
              </span>
              <span className="text-2xl font-semibold text-white">{pct(portfolioGTN)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Portfolio Charts ──────────────────────────────────────────────────── */}
      {drugs.length > 0 && (
        <div id="pdf-portfolio-chart">
          <PortfolioChart drugs={drugs} resultsList={resultsList} />
        </div>
      )}
    </div>
  );
}
