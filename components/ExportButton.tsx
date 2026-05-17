"use client";

import { useState } from "react";
import { exportSingleDrugPDF, exportPortfolioPDF } from "@/lib/pdfExport";

interface ExportButtonProps {
  activeTab: "single" | "portfolio";
  drugName?: string;
  hasScenarios?: boolean;
}

export default function ExportButton({
  activeTab,
  drugName = "",
  hasScenarios = false,
}: ExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      if (activeTab === "single") {
        await exportSingleDrugPDF(drugName, hasScenarios);
      } else {
        await exportPortfolioPDF();
      }
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-all hover:bg-white/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          {/* Spinner */}
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
              className="opacity-25"
            />
            <path
              fill="currentColor"
              className="opacity-75"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Generating…
        </>
      ) : (
        <>
          {/* Download arrow icon */}
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export PDF
        </>
      )}
    </button>
  );
}
