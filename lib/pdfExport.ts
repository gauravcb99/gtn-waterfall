// PDF export — uses html2canvas to capture DOM sections, jsPDF to assemble.
// "use client" not needed here — this is a pure browser-side utility
// imported only from client components.

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_W = 210; // A4 portrait mm
const PAGE_H = 297;
const ML = 15;      // left margin
const MR = 15;      // right margin
const MT = 18;      // top margin for content (after header)
const MB = 22;      // bottom margin (above footer line)
const CW = PAGE_W - ML - MR; // 180mm usable content width

const TEAL: [number, number, number] = [10, 71, 71];
const GOLD: [number, number, number] = [201, 168, 106];
const LGRAY: [number, number, number] = [148, 163, 184];
const WHITE: [number, number, number] = [255, 255, 255];

// ─── Internal state type ─────────────────────────────────────────────────────

interface PdfState {
  pdf: jsPDF;
  y: number;   // current y cursor in mm
  page: number;
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function drawFooter(st: PdfState) {
  const { pdf, page } = st;
  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...LGRAY);
  pdf.text(
    "GTN Waterfall Modeler — For commercial finance and market access modeling purposes only",
    ML,
    PAGE_H - 10
  );
  pdf.text(`Page ${page}`, PAGE_W - MR, PAGE_H - 10, { align: "right" });
}

// ─── Page management ─────────────────────────────────────────────────────────

function addPage(st: PdfState) {
  drawFooter(st);
  st.pdf.addPage();
  st.page++;
  st.y = MT;
}

// ─── Capture helper ───────────────────────────────────────────────────────────

async function captureEl(el: HTMLElement): Promise<HTMLCanvasElement> {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging: false,
    allowTaint: true,
    windowWidth: document.documentElement.scrollWidth,
    windowHeight: document.documentElement.scrollHeight,
  });
}

// ─── Image placement — handles slicing across page boundaries ────────────────

async function placeImage(st: PdfState, canvas: HTMLCanvasElement) {
  const imgH = (canvas.height / canvas.width) * CW;
  const available = PAGE_H - MB - st.y;

  if (imgH <= available) {
    // Fits entirely on the current page
    st.pdf.addImage(canvas.toDataURL("image/png"), "PNG", ML, st.y, CW, imgH);
    st.y += imgH + 4;
    return;
  }

  if (imgH <= PAGE_H - MT - MB) {
    // Doesn't fit here, but fits on a fresh page
    addPage(st);
    st.pdf.addImage(canvas.toDataURL("image/png"), "PNG", ML, st.y, CW, imgH);
    st.y += imgH + 4;
    return;
  }

  // Taller than a single page — slice it across multiple pages
  const pxPerMM = canvas.width / CW;
  let srcY = 0;

  while (srcY < canvas.height) {
    const availMM = PAGE_H - MB - st.y;
    const slicePx = Math.min(availMM * pxPerMM, canvas.height - srcY);
    if (slicePx <= 0) { addPage(st); continue; }

    const sliceMM = slicePx / pxPerMM;

    // Create a temporary canvas for this slice
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = Math.ceil(slicePx);
    const ctx = tmp.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        canvas,
        0, srcY, canvas.width, Math.ceil(slicePx),
        0, 0,   canvas.width, Math.ceil(slicePx)
      );
    }
    st.pdf.addImage(tmp.toDataURL("image/png"), "PNG", ML, st.y, CW, sliceMM);

    srcY += Math.ceil(slicePx);
    st.y += sliceMM;
    if (srcY < canvas.height) addPage(st);
  }
  st.y += 4;
}

// ─── Section label bar ────────────────────────────────────────────────────────

function sectionBar(st: PdfState, label: string) {
  if (st.y + 14 > PAGE_H - MB) addPage(st);
  const { pdf } = st;
  pdf.setFillColor(...TEAL);
  pdf.rect(ML, st.y, CW, 7, "F");
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "bold");
  pdf.text(label, ML + 3, st.y + 5);
  st.y += 10;
}

// ─── Report header (first page) ───────────────────────────────────────────────

function drawReportHeader(st: PdfState, title: string, subtitle: string) {
  const { pdf } = st;
  pdf.setFillColor(...TEAL);
  pdf.rect(0, 0, PAGE_W, 27, "F");
  pdf.setTextColor(...WHITE);
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text(title, ML, 11.5);
  pdf.setFontSize(8.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...GOLD);
  pdf.text(subtitle, ML, 20.5);
  st.y = 33;
}

// ─── Single Drug PDF ──────────────────────────────────────────────────────────

export async function exportSingleDrugPDF(
  drugName: string,
  hasScenarios: boolean
): Promise<void> {
  // Small delay so Recharts SVGs are fully painted
  await new Promise<void>((r) => setTimeout(r, 500));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const st: PdfState = {
    pdf: new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
    y: MT,
    page: 1,
  };

  // Header
  drawReportHeader(
    st,
    "GTN Waterfall Analysis Report",
    `Generated on ${dateStr} at ${timeStr}`
  );

  // Drug name subheader
  st.pdf.setTextColor(...TEAL);
  st.pdf.setFontSize(12);
  st.pdf.setFont("helvetica", "bold");
  st.pdf.text(drugName || "Drug Analysis", ML, st.y);
  st.y += 7;

  // ── Inputs + Results (top row, both columns) ──────────────────
  const topEl = document.getElementById("pdf-single-top");
  if (topEl) {
    sectionBar(st, "Model Inputs & Results");
    await placeImage(st, await captureEl(topEl));
  }

  // ── Waterfall Chart ───────────────────────────────────────────
  const wfEl = document.getElementById("pdf-single-waterfall");
  if (wfEl) {
    sectionBar(st, "GTN Waterfall — Gross to Net Revenue Bridge");
    await placeImage(st, await captureEl(wfEl));
  }

  // ── WAC Compression (only if the section is expanded) ─────────
  const wacEl = document.getElementById("pdf-single-wac");
  if (wacEl && wacEl.getBoundingClientRect().height > 110) {
    sectionBar(st, "WAC Compression Scenario");
    await placeImage(st, await captureEl(wacEl));
  }

  // ── Saved Scenarios ───────────────────────────────────────────
  if (hasScenarios) {
    const scenEl = document.getElementById("pdf-single-scenarios");
    if (scenEl) {
      sectionBar(st, "Scenario Save & Compare");
      await placeImage(st, await captureEl(scenEl));
    }
  }

  drawFooter(st);

  const safeDate = now.toISOString().slice(0, 10);
  const safeName = (drugName || "Drug").replace(/[^a-z0-9]/gi, "_");
  st.pdf.save(`GTN_Analysis_${safeName}_${safeDate}.pdf`);
}

// ─── Portfolio PDF ────────────────────────────────────────────────────────────

export async function exportPortfolioPDF(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 500));

  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit",
  });

  const st: PdfState = {
    pdf: new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
    y: MT,
    page: 1,
  };

  drawReportHeader(
    st,
    "Portfolio GTN Analysis Report",
    `Generated on ${dateStr} at ${timeStr}`
  );

  // Portfolio summary and charts are identified by explicit IDs in PortfolioView.
  const summaryEl = document.getElementById("pdf-portfolio-summary");
  const chartEl = document.getElementById("pdf-portfolio-chart");
  const container = document.getElementById("pdf-portfolio-container");

  if (summaryEl) {
    sectionBar(st, "Portfolio Summary");
    await placeImage(st, await captureEl(summaryEl));
  }

  if (chartEl) {
    sectionBar(st, "Portfolio Charts");
    await placeImage(st, await captureEl(chartEl));
  }

  if (!summaryEl && !chartEl && container) {
    // Fallback: capture the full container
    sectionBar(st, "Portfolio Overview");
    await placeImage(st, await captureEl(container));
  }

  drawFooter(st);

  const safeDate = now.toISOString().slice(0, 10);
  st.pdf.save(`GTN_Portfolio_Analysis_${safeDate}.pdf`);
}
