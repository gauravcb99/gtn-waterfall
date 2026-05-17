"use client";

import { useState, useCallback } from "react";
import { calculate, InputValues, CalculationResults } from "@/lib/calculations";
import InputForm from "@/components/InputForm";
import ResultsPanel from "@/components/ResultsPanel";
import WacCompressionScenario from "@/components/WacCompressionScenario";
import IRAImpactScenario from "@/components/IRAImpactScenario";
import WaterfallChart from "@/components/WaterfallChart";
import PortfolioView from "@/components/PortfolioView";
import ScenarioManager, { SavedScenario } from "@/components/ScenarioManager";
import SensitivityAnalysis from "@/components/SensitivityAnalysis";
import InflationPenaltyModule from "@/components/InflationPenaltyModule";
import ChannelMixOptimizer from "@/components/ChannelMixOptimizer";
import ExportButton from "@/components/ExportButton";
import MultiYearForecast from "@/components/MultiYearForecast";

const DEFAULT_INPUTS: InputValues = {
  drugName: "Sample Drug",
  wac: 1000,
  ampPercentage: 95,
  currentBestPrice: 730,
  commercialRebatePercentage: 35,
  commercialVolume: 50000,
  medicaidVolume: 10000,
  volume340B: 5000,
};

type Tab = "single" | "portfolio";
type SingleSubTab = "analysis" | "forecast";

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("single");
  const [singleSubTab, setSingleSubTab] = useState<SingleSubTab>("analysis");
  const [inputs, setInputs] = useState<InputValues>(DEFAULT_INPUTS);
  const [results, setResults] = useState<CalculationResults>(() =>
    calculate(DEFAULT_INPUTS)
  );
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);

  const handleChange = useCallback((newInputs: InputValues) => {
    setInputs(newInputs);
    setResults(calculate(newInputs));
  }, []);

  const handleCalculate = useCallback(() => {
    setResults(calculate(inputs));
  }, [inputs]);

  const handleSaveScenario = useCallback(
    (name: string) => {
      setScenarios((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          name,
          inputs: { ...inputs },
          results: { ...results },
        },
      ]);
    },
    [inputs, results]
  );

  const handleLoadScenario = useCallback((scenarioInputs: InputValues) => {
    setInputs(scenarioInputs);
    setResults(calculate(scenarioInputs));
  }, []);

  const handleRemoveScenario = useCallback((id: string) => {
    setScenarios((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return (
    <div className="min-h-screen bg-cream font-poppins">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="bg-[#0A4747] px-8 py-5 shadow-md">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">
              GTN Waterfall Modeler
            </h1>
            <p className="text-sm font-semibold text-[#C9A86A] mt-0.5 tracking-wide">
              Medicaid Best Price Cascade Engine
            </p>
          </div>

          {/* Export button — top-right of header */}
          <ExportButton
            activeTab={activeTab}
            drugName={inputs.drugName}
            hasScenarios={scenarios.length > 0}
          />
        </div>
      </header>

      {/* ── Tab Navigation ─────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-8">
        <div className="max-w-[1440px] mx-auto flex items-end gap-0">
          <button
            onClick={() => setActiveTab("single")}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === "single"
                ? "border-[#0A4747] text-[#0A4747] bg-white"
                : "border-transparent text-gray-500 hover:text-[#0A4747] hover:border-gray-300 bg-transparent"
            }`}
          >
            Single Drug Analysis
          </button>
          <button
            onClick={() => setActiveTab("portfolio")}
            className={`px-5 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === "portfolio"
                ? "border-[#0A4747] text-[#0A4747] bg-white"
                : "border-transparent text-gray-500 hover:text-[#0A4747] hover:border-gray-300 bg-transparent"
            }`}
          >
            Portfolio Analysis
          </button>
        </div>
      </div>

      {/* ── Single Drug context strip + sub-tabs ───────────────────── */}
      {activeTab === "single" && (
        <div className="bg-white border-b border-gray-200 px-8">
          <div className="max-w-[1440px] mx-auto flex items-center justify-between">
            {/* Sub-tab nav */}
            <div className="flex items-end gap-0">
              <button
                onClick={() => setSingleSubTab("analysis")}
                className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  singleSubTab === "analysis"
                    ? "border-[#C9A86A] text-[#0A4747] bg-white"
                    : "border-transparent text-gray-400 hover:text-[#0A4747] hover:border-gray-200 bg-transparent"
                }`}
              >
                Single Drug Analysis
              </button>
              <button
                onClick={() => setSingleSubTab("forecast")}
                className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 -mb-px ${
                  singleSubTab === "forecast"
                    ? "border-[#C9A86A] text-[#0A4747] bg-white"
                    : "border-transparent text-gray-400 hover:text-[#0A4747] hover:border-gray-200 bg-transparent"
                }`}
              >
                Multi-Year Forecast
              </button>
            </div>
            {/* Drug name context */}
            <p className="text-xs text-gray-500 pb-2">
              Modeling:{" "}
              <span className="font-semibold text-[#0A4747]">
                {inputs.drugName || "—"}
              </span>
            </p>
          </div>
        </div>
      )}

      <main className="max-w-[1440px] mx-auto px-8 py-6 flex flex-col gap-6">
        {activeTab === "single" && singleSubTab === "forecast" ? (
          /* ── Multi-Year Forecast sub-tab ──────────────────────────── */
          <MultiYearForecast inputs={inputs} />
        ) : activeTab === "single" ? (
          <>
            {/*
              ── Single Drug: top row (Inputs + Results) ───────────────
              id="pdf-single-top" captured as one unit in the PDF
            */}
            <div id="pdf-single-top" className="flex gap-6 items-start">
              {/* Input Form — 40% */}
              <div className="w-[40%] shrink-0">
                <div className="rounded-xl bg-cream border border-gray-200 shadow-sm p-6">
                  <InputForm
                    values={inputs}
                    onChange={handleChange}
                    onCalculate={handleCalculate}
                  />
                </div>
              </div>

              {/* Results Panel — 60% */}
              <div className="flex-1 min-w-0">
                <ResultsPanel results={results} inputs={inputs} />
              </div>
            </div>

            {/*
              ── Scenario Save & Compare ────────────────────────────────
              id="pdf-single-scenarios" — captured only when hasScenarios
            */}
            <div id="pdf-single-scenarios">
              <ScenarioManager
                currentInputs={inputs}
                currentResults={results}
                scenarios={scenarios}
                onSave={handleSaveScenario}
                onLoad={handleLoadScenario}
                onRemove={handleRemoveScenario}
              />
            </div>

            {/*
              ── Sensitivity Analysis ───────────────────────────────────
            */}
            <SensitivityAnalysis inputs={inputs} />

            {/*
              ── WAC Compression Scenario ───────────────────────────────
              id="pdf-single-wac" — captured only when expanded (height > 110px)
            */}
            <div id="pdf-single-wac">
              <WacCompressionScenario inputs={inputs} results={results} />
            </div>

            {/*
              ── IRA Negotiation Impact ─────────────────────────────────
              id="pdf-single-ira"
            */}
            <div id="pdf-single-ira">
              <IRAImpactScenario inputs={inputs} results={results} />
            </div>

            {/*
              ── Inflation Rebate Penalty ────────────────────────────────
            */}
            <InflationPenaltyModule inputs={inputs} />

            {/*
              ── Channel Mix Optimizer ──────────────────────────────────
            */}
            <ChannelMixOptimizer inputs={inputs} />

            {/*
              ── Waterfall Chart ────────────────────────────────────────
              id="pdf-single-waterfall"
            */}
            <div id="pdf-single-waterfall">
              <WaterfallChart results={results} />
            </div>
          </>
        ) : (
          /*
            ── Portfolio ──────────────────────────────────────────────────
            id="pdf-portfolio-container" — export logic walks inside to find
            the right-panel div (.flex-1.min-w-0.flex.flex-col) and captures
            PortfolioSummary (children[0]) and PortfolioChart (children[1])
            separately.
          */
          <div id="pdf-portfolio-container">
            <PortfolioView />
          </div>
        )}
      </main>

      <footer className="max-w-[1440px] mx-auto px-8 py-4 mt-2">
        <p className="text-xs text-gray-400 text-center">
          GTN Waterfall Modeler · For commercial finance and market access modeling purposes only
        </p>
      </footer>
    </div>
  );
}
