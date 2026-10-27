import type { ReactNode } from "react";

// Class patterns copied from the existing tool's components (not imported).
export const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-ink focus:border-[#0A4747] focus:outline-none focus:ring-1 focus:ring-[#0A4747] transition-colors";
export const labelClass = "text-xs font-semibold uppercase tracking-wide text-[#0A4747]";
export const cardClass = "rounded-xl border border-gray-100 bg-white p-5 shadow-sm flex flex-col gap-4";
export const buttonClass =
  "rounded-lg bg-[#0A4747] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0A4747]/90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function CardTitle({ step, children }: { step?: number; children: ReactNode }) {
  return (
    <h2 className="text-base font-bold text-[#0A4747]">
      {step !== undefined && <span className="text-[#C9A86A] mr-2">{step}.</span>}
      {children}
    </h2>
  );
}
