"use client";

import { useState, useRef, useEffect } from "react";

export interface AuditInput {
  name: string;
  value: string;
}

interface AuditIconProps {
  formula: string;
  inputs: AuditInput[];
  citation: string;
  /** Pass true when the icon sits on a dark/teal background so it renders in white */
  inverted?: boolean;
}

export function AuditIcon({
  formula,
  inputs,
  citation,
  inverted = false,
}: AuditIconProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  const borderColor = inverted ? "rgba(255,255,255,0.75)" : "#0A4747";
  const textColor = inverted ? "rgba(255,255,255,0.9)" : "#0A4747";
  const hoverBg = inverted ? "rgba(255,255,255,0.15)" : "rgba(10,71,71,0.08)";

  return (
    <span
      ref={containerRef}
      className="relative inline-flex items-center align-middle ml-1 shrink-0"
    >
      {/* ── "i" circle button ─────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="View audit trail"
        title="View formula & statutory citation"
        className="inline-flex items-center justify-center rounded-full transition-colors"
        style={{
          width: 16,
          height: 16,
          border: `1.5px solid ${borderColor}`,
          color: textColor,
          fontSize: 10,
          fontWeight: 700,
          fontFamily: "var(--font-poppins), sans-serif",
          lineHeight: 1,
          flexShrink: 0,
          backgroundColor: "transparent",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = hoverBg;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            "transparent";
        }}
      >
        i
      </button>

      {/* ── Popover drawer ────────────────────────────────────────────── */}
      {open && (
        <div
          className="absolute z-50 rounded-lg shadow-xl"
          style={{
            top: "100%",
            left: 0,
            marginTop: 6,
            width: 300,
            backgroundColor: "#FAF7F2",
            borderLeft: "4px solid #C9A86A",
            fontFamily: "var(--font-poppins), sans-serif",
          }}
        >
          <div className="p-4 flex flex-col gap-3">
            {/* Formula */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "#C9A86A" }}
              >
                Formula
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#1A1A1A" }}>
                {formula}
              </p>
            </div>

            {/* Inputs */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                style={{ color: "#C9A86A" }}
              >
                Inputs Used
              </p>
              <div className="flex flex-col gap-1">
                {inputs.map(({ name, value }) => (
                  <div key={name} className="flex justify-between gap-2">
                    <span className="text-xs text-gray-500">{name}</span>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: "#0A4747" }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Citation */}
            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "#C9A86A" }}
              >
                Statutory Citation
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "#1A1A1A" }}>
                {citation}
              </p>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
