"use client";

import { InputValues, CalculationResults } from "@/lib/calculations";

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

interface PortfolioSummaryProps {
  drugs: InputValues[];
  resultsList: CalculationResults[];
}

export default function PortfolioSummary({ drugs, resultsList }: PortfolioSummaryProps) {
  const totalDrugs = drugs.length;
  const cascadeCount = resultsList.filter((r) => r.bestPriceTriggered).length;
  const totalIncrementalExposure = resultsList.reduce(
    (sum, r) => sum + r.incrementalMedicaidExposure,
    0
  );
  const totalGrossRevenue = resultsList.reduce((sum, r) => sum + r.totalGrossRevenue, 0);
  const totalNetRevenue = resultsList.reduce((sum, r) => sum + r.totalNetRevenue, 0);
  const portfolioGTN =
    totalGrossRevenue > 0
      ? (1 - totalNetRevenue / totalGrossRevenue) * 100
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-3">
        {/* Card 1: Total Drugs */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Total Drugs
          </span>
          <span className="text-2xl font-semibold text-[#0A4747]">{totalDrugs}</span>
          <span className="text-xs text-gray-400">in portfolio</span>
        </div>

        {/* Card 2: Cascade Triggered */}
        <div
          className={`rounded-xl border p-4 flex flex-col gap-1 ${
            cascadeCount > 0
              ? "bg-[#C9A86A]/15 border-[#C9A86A]"
              : "bg-white border-gray-100"
          }`}
        >
          <span
            className={`text-xs font-semibold uppercase tracking-wide ${
              cascadeCount > 0 ? "text-[#92400E]" : "text-gray-500"
            }`}
          >
            Cascade Triggered
          </span>
          <span
            className={`text-2xl font-semibold ${
              cascadeCount > 0 ? "text-[#92400E]" : "text-[#0A4747]"
            }`}
          >
            {cascadeCount}
          </span>
          <span
            className={`text-xs ${
              cascadeCount > 0 ? "text-[#92400E]/70" : "text-gray-400"
            }`}
          >
            of {totalDrugs} drugs
          </span>
        </div>

        {/* Card 3: Total Incremental Exposure */}
        <div className="rounded-xl border border-[#0A4747] bg-[#0A4747] p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#C9A86A]">
            Total Incr. Exposure
          </span>
          <span className="text-xl font-semibold text-white leading-tight">
            {usd.format(totalIncrementalExposure)}
          </span>
          <span className="text-xs text-[#C9A86A]/70">across all Medicaid volumes</span>
        </div>

        {/* Card 4: Portfolio GTN Spread */}
        <div className="rounded-xl border border-gray-100 bg-white p-4 flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Portfolio GTN Spread
          </span>
          <span className="text-2xl font-semibold text-[#0A4747]">
            {pct(portfolioGTN)}
          </span>
          <span className="text-xs text-gray-400">weighted average</span>
        </div>
      </div>

      {/* Drug-by-Drug Comparison Table */}
      <div className="rounded-xl border border-gray-100 overflow-hidden bg-white">
        <div className="bg-[#0A4747] px-4 py-2.5">
          <h3 className="text-sm font-semibold text-white">Drug-by-Drug Comparison</h3>
        </div>

        {drugs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No drugs in portfolio. Click &quot;+ Add Drug&quot; to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    Drug Name
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    WAC
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    Rebate %
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    Comm. Net Price
                  </th>
                  <th className="text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    BP Triggered
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    Old Rebate/Unit
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    New Rebate/Unit
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    Incr. Exposure
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                    GTN Spread
                  </th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((drug, i) => {
                  const r = resultsList[i];
                  return (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-[#1A1A1A] whitespace-nowrap">
                        {drug.drugName || "—"}
                      </td>
                      <td className="px-3 py-3 text-right text-[#1A1A1A]">
                        {usd2.format(drug.wac)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#1A1A1A]">
                        {drug.commercialRebatePercentage}%
                      </td>
                      <td className="px-3 py-3 text-right text-[#1A1A1A]">
                        {usd2.format(r.commercialNetPrice)}
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
                      <td className="px-3 py-3 text-right text-[#1A1A1A]">
                        {usd2.format(r.oldMedicaidRebatePerUnit)}
                      </td>
                      <td className="px-3 py-3 text-right text-[#1A1A1A]">
                        {usd2.format(r.newMedicaidRebatePerUnit)}
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
                    </tr>
                  );
                })}

                {/* Total row */}
                <tr className="bg-[#0A4747]/5 border-t border-[#0A4747]/20">
                  <td className="px-4 py-3 font-semibold text-[#0A4747]">PORTFOLIO TOTAL</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-3 text-center">
                    <span className="text-xs text-gray-400">
                      {cascadeCount}/{totalDrugs}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-3 text-right text-gray-400 text-xs">—</td>
                  <td className="px-3 py-3 text-right font-semibold text-[#C9A86A]">
                    {usd.format(totalIncrementalExposure)}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-[#0A4747]">
                    {pct(portfolioGTN)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GTN Summary Row */}
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
    </div>
  );
}
