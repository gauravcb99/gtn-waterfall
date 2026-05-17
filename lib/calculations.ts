export interface InputValues {
  drugName: string;
  wac: number;
  ampPercentage: number;
  currentBestPrice: number;
  commercialRebatePercentage: number;
  commercialVolume: number;
  medicaidVolume: number;
  volume340B: number;
}

export interface CalculationResults {
  // Price calculations
  amp: number;
  commercialNetPrice: number;
  standardMedicaidRebate: number;
  bestPriceDifferential: number;
  oldMedicaidRebatePerUnit: number;
  // Best Price trigger
  bestPriceTriggered: boolean;
  newBestPrice: number;
  newBestPriceDifferential: number;
  newMedicaidRebatePerUnit: number;
  incrementalMedicaidRebatePerUnit: number;
  incrementalMedicaidExposure: number;
  // 340B
  price340B: number;
  discount340BPerUnit: number;
  totalDiscount340B: number;
  // Revenue
  commercialNetRevenue: number;
  medicaidNetPrice: number;
  medicaidNetRevenue: number;
  netRevenue340B: number;
  totalNetRevenue: number;
  totalVolume: number;
  totalGrossRevenue: number;
  gtnSpreadPercentage: number;
  // Waterfall components
  commercialRebateTotal: number;
  medicaidRebateTotal: number;
}

// ─── Inflation Rebate Penalty ────────────────────────────────────────────────

export interface InflationPenaltyInputs {
  launchYear: number;
  launchWac: number;
  currentWac: number;
  cpiRatePct: number;
  medicaidVolume: number;
  medicarePartDVolume: number;
}

export interface InflationPenaltyResults {
  years: number;
  inflationAdjustedWac: number;
  penaltyPerUnit: number;
  medicaidPenalty: number;
  medicarePenalty: number;
  totalAnnualPenalty: number;
  penaltyAsPctOfWac: number;
  actualCagr: number;
  hasPenalty: boolean;
}

export function calculateInflationPenalty(
  inputs: InflationPenaltyInputs
): InflationPenaltyResults {
  const { launchYear, launchWac, currentWac, cpiRatePct, medicaidVolume, medicarePartDVolume } = inputs;
  const CURRENT_YEAR = 2026;

  const years = Math.max(0, CURRENT_YEAR - launchYear);
  const inflationAdjustedWac = launchWac > 0 ? launchWac * Math.pow(1 + cpiRatePct / 100, years) : 0;
  const penaltyPerUnit = Math.max(0, currentWac - inflationAdjustedWac);

  const medicaidPenalty = penaltyPerUnit * medicaidVolume;
  const medicarePenalty = penaltyPerUnit * medicarePartDVolume;
  const totalAnnualPenalty = medicaidPenalty + medicarePenalty;

  const penaltyAsPctOfWac = currentWac > 0 ? (penaltyPerUnit / currentWac) * 100 : 0;

  const actualCagr =
    years > 0 && launchWac > 0
      ? (Math.pow(currentWac / launchWac, 1 / years) - 1) * 100
      : 0;

  return {
    years,
    inflationAdjustedWac,
    penaltyPerUnit,
    medicaidPenalty,
    medicarePenalty,
    totalAnnualPenalty,
    penaltyAsPctOfWac,
    actualCagr,
    hasPenalty: penaltyPerUnit > 0,
  };
}

export interface InflationForecastScenario {
  label: string;
  annualIncreasePct: number;
  year1Wac: number;
  year1PenaltyPerUnit: number;
  year1TotalPenalty: number;
  year2Wac: number;
  year2PenaltyPerUnit: number;
  year2TotalPenalty: number;
  year3Wac: number;
  year3PenaltyPerUnit: number;
  year3TotalPenalty: number;
  cumulativePenalty: number;
}

export function calculateInflationForecast(
  penaltyInputs: InflationPenaltyInputs,
  penaltyResults: InflationPenaltyResults,
  strategies: Array<{ label: string; annualIncreasePct: number }>
): InflationForecastScenario[] {
  const { currentWac, medicaidVolume, medicarePartDVolume, cpiRatePct } = penaltyInputs;
  const { inflationAdjustedWac } = penaltyResults;
  const totalVolume = medicaidVolume + medicarePartDVolume;

  return strategies.map(({ label, annualIncreasePct }) => {
    function yearData(year: number) {
      const projectedWac = currentWac * Math.pow(1 + annualIncreasePct / 100, year);
      const projectedInflationAdj = inflationAdjustedWac * Math.pow(1 + cpiRatePct / 100, year);
      const penaltyPerUnit = Math.max(0, projectedWac - projectedInflationAdj);
      const totalPenalty = penaltyPerUnit * totalVolume;
      return { projectedWac, penaltyPerUnit, totalPenalty };
    }

    const y1 = yearData(1);
    const y2 = yearData(2);
    const y3 = yearData(3);

    return {
      label,
      annualIncreasePct,
      year1Wac: y1.projectedWac,
      year1PenaltyPerUnit: y1.penaltyPerUnit,
      year1TotalPenalty: y1.totalPenalty,
      year2Wac: y2.projectedWac,
      year2PenaltyPerUnit: y2.penaltyPerUnit,
      year2TotalPenalty: y2.totalPenalty,
      year3Wac: y3.projectedWac,
      year3PenaltyPerUnit: y3.penaltyPerUnit,
      year3TotalPenalty: y3.totalPenalty,
      cumulativePenalty: y1.totalPenalty + y2.totalPenalty + y3.totalPenalty,
    };
  });
}

// ─── WAC Compression ────────────────────────────────────────────────────────

export interface WacCompressionInputs {
  newWac: number;
  distributionFeePct: number;
  accessFeePct: number;
  wholesalerMarginPct: number;
}

export interface WacCompressionResults {
  wacReduction: number;
  // Per-unit fees at original WAC
  origDistFeePerUnit: number;
  origAccessFeePerUnit: number;
  origWholesalerPerUnit: number;
  // Per-unit fees at new WAC
  newDistFeePerUnit: number;
  newAccessFeePerUnit: number;
  newWholesalerPerUnit: number;
  // Per-unit compression
  distCompressionPerUnit: number;
  accessCompressionPerUnit: number;
  wholesalerCompressionPerUnit: number;
  // Total fee pools at original WAC
  origDistFeeTotal: number;
  origAccessFeeTotal: number;
  origWholesalerTotal: number;
  // Total fee pools at new WAC
  newDistFeeTotal: number;
  newAccessFeeTotal: number;
  newWholesalerTotal: number;
  // Total compression per fee type
  totalDistCompression: number;
  totalAccessCompression: number;
  totalWholesalerCompression: number;
  // Aggregate
  totalEcosystemDollarsRemoved: number;
  // Full recalculation at new WAC
  newWacResults: CalculationResults;
}

export function calculateWacCompression(
  originalInputs: InputValues,
  compressionInputs: WacCompressionInputs,
  originalResults: CalculationResults
): WacCompressionResults {
  const { newWac, distributionFeePct, accessFeePct, wholesalerMarginPct } = compressionInputs;
  const { wac } = originalInputs;
  const totalVolume = originalResults.totalVolume;

  const wacReduction = wac - newWac;

  // Per-unit fees
  const origDistFeePerUnit = wac * (distributionFeePct / 100);
  const newDistFeePerUnit = newWac * (distributionFeePct / 100);
  const distCompressionPerUnit = origDistFeePerUnit - newDistFeePerUnit;

  const origAccessFeePerUnit = wac * (accessFeePct / 100);
  const newAccessFeePerUnit = newWac * (accessFeePct / 100);
  const accessCompressionPerUnit = origAccessFeePerUnit - newAccessFeePerUnit;

  const origWholesalerPerUnit = wac * (wholesalerMarginPct / 100);
  const newWholesalerPerUnit = newWac * (wholesalerMarginPct / 100);
  const wholesalerCompressionPerUnit = origWholesalerPerUnit - newWholesalerPerUnit;

  // Total fee pools
  const origDistFeeTotal = origDistFeePerUnit * totalVolume;
  const newDistFeeTotal = newDistFeePerUnit * totalVolume;
  const totalDistCompression = distCompressionPerUnit * totalVolume;

  const origAccessFeeTotal = origAccessFeePerUnit * totalVolume;
  const newAccessFeeTotal = newAccessFeePerUnit * totalVolume;
  const totalAccessCompression = accessCompressionPerUnit * totalVolume;

  const origWholesalerTotal = origWholesalerPerUnit * totalVolume;
  const newWholesalerTotal = newWholesalerPerUnit * totalVolume;
  const totalWholesalerCompression = wholesalerCompressionPerUnit * totalVolume;

  const totalEcosystemDollarsRemoved =
    totalDistCompression + totalAccessCompression + totalWholesalerCompression;

  // Full downstream recalculation with new WAC
  const newWacResults = calculate({ ...originalInputs, wac: newWac });

  return {
    wacReduction,
    origDistFeePerUnit,
    origAccessFeePerUnit,
    origWholesalerPerUnit,
    newDistFeePerUnit,
    newAccessFeePerUnit,
    newWholesalerPerUnit,
    distCompressionPerUnit,
    accessCompressionPerUnit,
    wholesalerCompressionPerUnit,
    origDistFeeTotal,
    origAccessFeeTotal,
    origWholesalerTotal,
    newDistFeeTotal,
    newAccessFeeTotal,
    newWholesalerTotal,
    totalDistCompression,
    totalAccessCompression,
    totalWholesalerCompression,
    totalEcosystemDollarsRemoved,
    newWacResults,
  };
}

// ─── IRA Negotiation Impact ──────────────────────────────────────────────────

export interface IRAImpactInputs {
  yearsOnMarket: number;
  nonFederalAMP: number;
  medicarePartDVolume: number;
  medicarePartDRebatePct: number;
  catastrophicDiscountPct: number;
}

export interface IRAImpactResults {
  ceilingPct: number;           // 0.75 | 0.60 | 0.40
  iraPriceCeiling: number;      // Non-Federal AMP * ceilingPct
  currentMedicareNetPrice: number;
  iraNegotiatedPrice: number;
  priceReductionPerUnit: number;
  currentMedicareRevenue: number;
  newMedicareRevenue: number;
  totalMedicareRevenueImpact: number;
  catastrophicLiabilityPerUnit: number;
  totalCatastrophicLiability: number;
  totalIRAImpact: number;
  iraImpactAsPctOfNetRevenue: number;
  alreadyBelowCeiling: boolean;  // true if current net price < IRA ceiling
}

export function calculateIRAImpact(
  iraInputs: IRAImpactInputs,
  wac: number,
  totalNetRevenue: number
): IRAImpactResults {
  const {
    yearsOnMarket,
    nonFederalAMP,
    medicarePartDVolume,
    medicarePartDRebatePct,
    catastrophicDiscountPct,
  } = iraInputs;

  // Step 1: Determine ceiling percentage
  let ceilingPct: number;
  if (yearsOnMarket >= 20) {
    ceilingPct = 0.40;
  } else if (yearsOnMarket >= 16) {
    ceilingPct = 0.60;
  } else {
    ceilingPct = 0.75; // 9-15 years
  }

  const iraPriceCeiling = nonFederalAMP * ceilingPct;

  // Step 2: Current Medicare net price
  const currentMedicareNetPrice = wac * (1 - medicarePartDRebatePct / 100);

  // Step 3: IRA negotiated price = MIN(ceiling, current net price)
  const iraNegotiatedPrice = Math.min(iraPriceCeiling, currentMedicareNetPrice);
  const alreadyBelowCeiling = currentMedicareNetPrice <= iraPriceCeiling;

  // Step 4: Per-unit price reduction (cannot be negative)
  const priceReductionPerUnit = Math.max(0, currentMedicareNetPrice - iraNegotiatedPrice);

  // Step 5: Total Medicare revenue impact
  const currentMedicareRevenue = currentMedicareNetPrice * medicarePartDVolume;
  const newMedicareRevenue = iraNegotiatedPrice * medicarePartDVolume;
  const totalMedicareRevenueImpact = currentMedicareRevenue - newMedicareRevenue;

  // Step 6: Catastrophic phase liability (15% of Part D volume reaches catastrophic)
  const catastrophicLiabilityPerUnit = iraNegotiatedPrice * (catastrophicDiscountPct / 100);
  const totalCatastrophicLiability = catastrophicLiabilityPerUnit * medicarePartDVolume * 0.15;

  // Step 7: Combined IRA impact
  const totalIRAImpact = totalMedicareRevenueImpact + totalCatastrophicLiability;

  // Step 8: Impact as % of total net revenue
  const iraImpactAsPctOfNetRevenue =
    totalNetRevenue > 0 ? (totalIRAImpact / totalNetRevenue) * 100 : 0;

  return {
    ceilingPct,
    iraPriceCeiling,
    currentMedicareNetPrice,
    iraNegotiatedPrice,
    priceReductionPerUnit,
    currentMedicareRevenue,
    newMedicareRevenue,
    totalMedicareRevenueImpact,
    catastrophicLiabilityPerUnit,
    totalCatastrophicLiability,
    totalIRAImpact,
    iraImpactAsPctOfNetRevenue,
    alreadyBelowCeiling,
  };
}

// ─── Channel Mix Optimizer ───────────────────────────────────────────────────

export interface ChannelMixCandidate {
  commercialPct: number;
  medicaidPct: number;
  b340Pct: number;
  commercialVol: number;
  medicaidVol: number;
  vol340B: number;
  gtnSpread: number;
  totalNetRevenue: number;
  incrementalMedicaidExposure: number;
  bestPriceTriggered: boolean;
}

export interface ChannelMixHeatmapCell {
  commercialPct: number;
  medicaidPct: number;
  b340Pct: number;
  gtnSpread: number | null; // null when 340B% would be negative
}

export interface ChannelMixOptimizerResults {
  optimal: ChannelMixCandidate;
  worst: ChannelMixCandidate;
  current: ChannelMixCandidate;
  heatmap: ChannelMixHeatmapCell[][];  // [row=commercial%][col=medicaid%]
  heatmapCommercialPcts: number[];
  heatmapMedicaidPcts: number[];
  minGtn: number;
  maxGtn: number;
  primaryDriver: string;
  isCurrentOptimal: boolean;
}

// ─── Main Calculation ────────────────────────────────────────────────────────

export function calculate(inputs: InputValues): CalculationResults {
  const {
    wac,
    ampPercentage,
    currentBestPrice,
    commercialRebatePercentage,
    commercialVolume,
    medicaidVolume,
    volume340B,
  } = inputs;

  // Core prices
  const amp = wac * (ampPercentage / 100);
  const commercialNetPrice = wac * (1 - commercialRebatePercentage / 100);

  // Old Medicaid rebate: MAX(statutory floor, AMP - current Best Price)
  const standardMedicaidRebate = amp * 0.231;
  const bestPriceDifferential = amp - currentBestPrice;
  const oldMedicaidRebatePerUnit = Math.max(standardMedicaidRebate, bestPriceDifferential);

  // Best Price trigger
  const bestPriceTriggered = commercialNetPrice < currentBestPrice;
  const newBestPrice = bestPriceTriggered ? commercialNetPrice : currentBestPrice;

  // New Medicaid rebate: MAX of statutory floor vs AMP-minus-new-BP
  const newBestPriceDifferential = amp - newBestPrice;
  const newMedicaidRebatePerUnit = Math.max(standardMedicaidRebate, newBestPriceDifferential);

  const incrementalMedicaidRebatePerUnit = newMedicaidRebatePerUnit - oldMedicaidRebatePerUnit;
  const incrementalMedicaidExposure = incrementalMedicaidRebatePerUnit * medicaidVolume;

  // 340B
  const price340B = amp - newMedicaidRebatePerUnit;
  const discount340BPerUnit = wac - price340B;
  const totalDiscount340B = discount340BPerUnit * volume340B;

  // Revenue by channel
  const commercialNetRevenue = commercialNetPrice * commercialVolume;
  const medicaidNetPrice = wac - newMedicaidRebatePerUnit;
  const medicaidNetRevenue = medicaidNetPrice * medicaidVolume;
  const netRevenue340B = price340B * volume340B;
  const totalNetRevenue = commercialNetRevenue + medicaidNetRevenue + netRevenue340B;

  // Totals
  const totalVolume = commercialVolume + medicaidVolume + volume340B;
  const totalGrossRevenue = wac * totalVolume;
  const gtnSpreadPercentage = (1 - totalNetRevenue / totalGrossRevenue) * 100;

  // Waterfall components (total dollars of each discount pool)
  const commercialRebateTotal = (wac - commercialNetPrice) * commercialVolume;
  const medicaidRebateTotal = newMedicaidRebatePerUnit * medicaidVolume;

  return {
    amp,
    commercialNetPrice,
    standardMedicaidRebate,
    bestPriceDifferential,
    oldMedicaidRebatePerUnit,
    bestPriceTriggered,
    newBestPrice,
    newBestPriceDifferential,
    newMedicaidRebatePerUnit,
    incrementalMedicaidRebatePerUnit,
    incrementalMedicaidExposure,
    price340B,
    discount340BPerUnit,
    totalDiscount340B,
    commercialNetRevenue,
    medicaidNetPrice,
    medicaidNetRevenue,
    netRevenue340B,
    totalNetRevenue,
    totalVolume,
    totalGrossRevenue,
    gtnSpreadPercentage,
    commercialRebateTotal,
    medicaidRebateTotal,
  };
}

// ─── Multi-Year GTN Trajectory Forecast ─────────────────────────────────────

export interface MultiYearForecastInputs {
  forecastYears: 3 | 4 | 5;
  // Volume growth (annual % change)
  commercialVolumeGrowthPct: number;
  medicaidVolumeGrowthPct: number;
  volume340BGrowthPct: number;
  medicareVolumeGrowthPct: number;
  medicareBaseVolume: number;
  // Pricing
  wacIncreasePct: number;
  commercialRebateEscalationPct: number; // percentage POINTS added per year
  cpiRatePct: number;
  // Regulatory
  iraYear: number | null; // null = Never
  iraCeilingPct: number;
}

export interface ForecastYearData {
  year: number;
  wac: number;
  commercialRebatePct: number;
  commercialVolume: number;
  medicaidVolume: number;
  volume340B: number;
  medicareVolume: number;
  totalVolume: number;
  grossRevenue: number;
  totalNetRevenue: number;
  gtnSpreadPct: number;
  bestPriceTriggered: boolean;
  incrementalMedicaidExposure: number;
  inflationPenalty: number;
  iraImpact: number;
  cascadeResults: CalculationResults;
  commercialPct: number;
  medicaidPct: number;
  pct340B: number;
  medicarePct: number;
}

export interface MultiYearForecastResults {
  years: ForecastYearData[];
}

export function calculateMultiYearForecast(
  baseInputs: InputValues,
  forecastInputs: MultiYearForecastInputs
): MultiYearForecastResults {
  const {
    forecastYears,
    commercialVolumeGrowthPct,
    medicaidVolumeGrowthPct,
    volume340BGrowthPct,
    medicareVolumeGrowthPct,
    medicareBaseVolume,
    wacIncreasePct,
    commercialRebateEscalationPct,
    cpiRatePct,
    iraYear,
    iraCeilingPct,
  } = forecastInputs;

  const years: ForecastYearData[] = [];

  for (let n = 0; n <= forecastYears; n++) {
    // Step 1: Project volumes
    const commVol = Math.round(
      baseInputs.commercialVolume * Math.pow(1 + commercialVolumeGrowthPct / 100, n)
    );
    const medVol = Math.round(
      baseInputs.medicaidVolume * Math.pow(1 + medicaidVolumeGrowthPct / 100, n)
    );
    const vol340B = Math.round(
      baseInputs.volume340B * Math.pow(1 + volume340BGrowthPct / 100, n)
    );
    const medicareVol = Math.round(
      medicareBaseVolume * Math.pow(1 + medicareVolumeGrowthPct / 100, n)
    );

    // Step 2: Project WAC
    const wac_n = baseInputs.wac * Math.pow(1 + wacIncreasePct / 100, n);

    // Step 3: AMP (stays at same % of WAC)
    const amp_n = wac_n * (baseInputs.ampPercentage / 100);

    // Step 4: Project Commercial Rebate % — percentage POINTS added per year, cap at 80%
    const rebate_n = Math.min(
      baseInputs.commercialRebatePercentage + commercialRebateEscalationPct * n,
      80
    );

    // Steps 5 & 6: Run full cascade calculation with projected inputs.
    // Each year compares against the original filed best price — the spec
    // explicitly models each year's cascade independently so that escalating
    // rebates can trigger (or re-trigger) the cascade as WAC / rebate evolve.
    const cascadeInputs: InputValues = {
      ...baseInputs,
      wac: wac_n,
      commercialRebatePercentage: rebate_n,
      commercialVolume: commVol,
      medicaidVolume: medVol,
      volume340B: vol340B,
      currentBestPrice: baseInputs.currentBestPrice, // always compare to original filed BP
    };
    const cascadeResult = calculate(cascadeInputs);

    // Step 7: IRA ceiling on Medicare revenue
    let medicareNetPrice = wac_n; // No Part D rebate in base case
    let iraImpact = 0;
    const iraCeilingPrice = amp_n * (iraCeilingPct / 100);
    if (iraYear !== null && n >= iraYear) {
      medicareNetPrice = Math.min(wac_n, iraCeilingPrice);
      iraImpact = Math.max(0, wac_n - medicareNetPrice) * medicareVol;
    }

    const medicareGrossRevenue = wac_n * medicareVol;
    const medicareNetRevenue = medicareNetPrice * medicareVol;

    // Step 8: Inflation penalty per unit (WAC growth above CPI baseline)
    // Treating Year 0 as the inflation baseline
    const inflationAdjustedWac = baseInputs.wac * Math.pow(1 + cpiRatePct / 100, n);
    const penaltyPerUnit = Math.max(0, wac_n - inflationAdjustedWac);
    // Apply to Medicaid + Medicare volumes (government channels face the penalty)
    const inflationPenalty = penaltyPerUnit * (medVol + medicareVol);

    // Step 9: Aggregate totals
    const totalVol = commVol + medVol + vol340B + medicareVol;
    const totalGross = cascadeResult.totalGrossRevenue + medicareGrossRevenue;
    const totalNet = cascadeResult.totalNetRevenue + medicareNetRevenue;
    const gtnSpreadPct = totalGross > 0 ? (1 - totalNet / totalGross) * 100 : 0;

    years.push({
      year: n,
      wac: wac_n,
      commercialRebatePct: rebate_n,
      commercialVolume: commVol,
      medicaidVolume: medVol,
      volume340B: vol340B,
      medicareVolume: medicareVol,
      totalVolume: totalVol,
      grossRevenue: totalGross,
      totalNetRevenue: totalNet,
      gtnSpreadPct,
      bestPriceTriggered: cascadeResult.bestPriceTriggered,
      incrementalMedicaidExposure: cascadeResult.incrementalMedicaidExposure,
      inflationPenalty,
      iraImpact,
      cascadeResults: cascadeResult,
      commercialPct: totalVol > 0 ? (commVol / totalVol) * 100 : 0,
      medicaidPct: totalVol > 0 ? (medVol / totalVol) * 100 : 0,
      pct340B: totalVol > 0 ? (vol340B / totalVol) * 100 : 0,
      medicarePct: totalVol > 0 ? (medicareVol / totalVol) * 100 : 0,
    });
  }

  return { years };
}

// ─── optimizeChannelMix (must live after calculate) ──────────────────────────

export function optimizeChannelMix(
  baseInputs: InputValues,
  totalVolume: number,
  minPcts: { commercial: number; medicaid: number; b340: number }
): ChannelMixOptimizerResults {
  // Helper: run calculate for a specific volume split
  function evalMix(cv: number, mv: number, bv: number): ChannelMixCandidate {
    const safeCV = Math.max(0, cv);
    const safeMV = Math.max(0, mv);
    const safeBV = Math.max(0, bv);
    const r = calculate({
      ...baseInputs,
      commercialVolume: safeCV,
      medicaidVolume: safeMV,
      volume340B: safeBV,
    });
    const total = safeCV + safeMV + safeBV;
    return {
      commercialPct: total > 0 ? (safeCV / total) * 100 : 0,
      medicaidPct: total > 0 ? (safeMV / total) * 100 : 0,
      b340Pct: total > 0 ? (safeBV / total) * 100 : 0,
      commercialVol: safeCV,
      medicaidVol: safeMV,
      vol340B: safeBV,
      gtnSpread: r.gtnSpreadPercentage,
      totalNetRevenue: r.totalNetRevenue,
      incrementalMedicaidExposure: r.incrementalMedicaidExposure,
      bestPriceTriggered: r.bestPriceTriggered,
    };
  }

  // Step 1: Generate all valid candidates at 5% step resolution
  const { commercial: commMin, medicaid: medicMin, b340: b340Min } = minPcts;
  const candidates: ChannelMixCandidate[] = [];

  for (let cp = commMin; cp <= 90; cp += 5) {
    for (let mp = medicMin; mp <= 50; mp += 5) {
      const bp = 100 - cp - mp;
      if (bp < b340Min || bp < 0) continue;
      const cv = Math.round(totalVolume * cp / 100);
      const mv = Math.round(totalVolume * mp / 100);
      const bv = totalVolume - cv - mv;
      candidates.push(evalMix(cv, mv, bv));
    }
  }

  // Fallback: if no candidates survive the min constraints, add a sensible default
  if (candidates.length === 0) {
    const cv = Math.round(totalVolume * 0.6);
    const mv = Math.round(totalVolume * 0.3);
    candidates.push(evalMix(cv, mv, totalVolume - cv - mv));
  }

  // Step 2: Find optimal (lowest GTN) and worst (highest GTN)
  let optimal = candidates[0];
  let worst = candidates[0];
  for (const c of candidates) {
    if (c.gtnSpread < optimal.gtnSpread) optimal = c;
    if (c.gtnSpread > worst.gtnSpread) worst = c;
  }

  // Step 3: Current mix — scale actual input proportions to totalVolume
  const origTotal =
    baseInputs.commercialVolume + baseInputs.medicaidVolume + baseInputs.volume340B;
  const curCV =
    origTotal > 0
      ? Math.round(totalVolume * (baseInputs.commercialVolume / origTotal))
      : Math.round(totalVolume * 0.77);
  const curMV =
    origTotal > 0
      ? Math.round(totalVolume * (baseInputs.medicaidVolume / origTotal))
      : Math.round(totalVolume * 0.154);
  const cur340 = totalVolume - curCV - curMV;
  const current = evalMix(curCV, curMV, cur340);

  // Step 4: Heatmap — fixed 10% commercial / 5% medicaid grid, no min constraints
  const heatmapCommercialPcts = [40, 50, 60, 70, 80, 90];
  const heatmapMedicaidPcts = [5, 10, 15, 20, 25, 30, 35, 40];

  const heatmap: ChannelMixHeatmapCell[][] = heatmapCommercialPcts.map((cp) =>
    heatmapMedicaidPcts.map((mp) => {
      const bp = 100 - cp - mp;
      if (bp < 0) {
        return { commercialPct: cp, medicaidPct: mp, b340Pct: 0, gtnSpread: null };
      }
      const cv = Math.round(totalVolume * cp / 100);
      const mv = Math.round(totalVolume * mp / 100);
      const bv = Math.max(0, totalVolume - cv - mv);
      const r = calculate({ ...baseInputs, commercialVolume: cv, medicaidVolume: mv, volume340B: bv });
      return { commercialPct: cp, medicaidPct: mp, b340Pct: bp, gtnSpread: r.gtnSpreadPercentage };
    })
  );

  // Step 5: Overall GTN range across all optimization candidates
  const allGtns = candidates.map((c) => c.gtnSpread);
  const minGtn = Math.min(...allGtns);
  const maxGtn = Math.max(...allGtns);

  // Step 6: Primary driver of GTN spread difference
  let primaryDriver = "Medicaid rebate magnitude";
  if (worst.bestPriceTriggered && !optimal.bestPriceTriggered) {
    primaryDriver = "Best Price cascade";
  } else if (worst.b340Pct - optimal.b340Pct > worst.medicaidPct - optimal.medicaidPct) {
    primaryDriver = "340B discount depth";
  }

  // Step 7: Is current mix already near-optimal?
  const isCurrentOptimal = Math.abs(current.gtnSpread - optimal.gtnSpread) < 0.5;

  return {
    optimal,
    worst,
    current,
    heatmap,
    heatmapCommercialPcts,
    heatmapMedicaidPcts,
    minGtn,
    maxGtn,
    primaryDriver,
    isCurrentOptimal,
  };
}
