"use client";

import type { LineType } from "@/lib/drug-line-review/types";
import type { ClaimFormState } from "./forms";
import { buttonClass, CardTitle, cardClass, Field, inputClass } from "./ui";

const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: "rev0250_description", label: "Rev code 0250, description only" },
  { value: "rev0636_hcpcs", label: "Rev code 0636, with HCPCS" },
  { value: "ndc_only", label: "NDC only" },
];

type Props = {
  claim: ClaimFormState;
  onChange: (patch: Partial<ClaimFormState>) => void;
  onFind: () => void;
  chargeNote: string | null; // where a loaded example's amount billed comes from
};

export default function ClaimForm({ claim, onChange, onFind, chargeNote }: Props) {
  return (
    <section className={cardClass}>
      <CardTitle step={1}>Claim line</CardTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Line type">
          <select
            className={inputClass}
            value={claim.lineType}
            onChange={(e) => onChange({ lineType: e.target.value as LineType })}
          >
            {LINE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {claim.lineType === "rev0250_description" && (
          <Field label="Description">
            <input className={inputClass} value={claim.description} onChange={(e) => onChange({ description: e.target.value })} />
          </Field>
        )}
        {claim.lineType === "rev0636_hcpcs" && (
          <Field label="HCPCS">
            <input className={inputClass} value={claim.hcpcs} onChange={(e) => onChange({ hcpcs: e.target.value })} />
          </Field>
        )}
        {claim.lineType === "ndc_only" && (
          <Field label="NDC" hint="Hyphenated as printed, or 11 digits without hyphens.">
            <input className={inputClass} value={claim.ndc} onChange={(e) => onChange({ ndc: e.target.value })} />
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Units billed" hint="Administered line">
          <input type="number" step="any" className={inputClass} value={claim.unitsBilled}
            onChange={(e) => onChange({ unitsBilled: e.target.value })} />
        </Field>
        <Field label="JW units billed" hint="Blank or 0 if no JW line">
          <input type="number" step="any" className={inputClass} value={claim.jwUnitsBilled}
            onChange={(e) => onChange({ jwUnitsBilled: e.target.value })} />
        </Field>
        <Field label="Amount billed ($)"
          hint={chargeNote
            ? <span className="font-semibold text-[#C9A86A]">{chargeNote}</span>
            : "Total for the drug on this claim"}>
          <input type="number" step="any" className={inputClass} value={claim.amountBilled}
            onChange={(e) => onChange({ amountBilled: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink sm:mt-6">
          <input type="checkbox" checked={claim.jzReported} onChange={(e) => onChange({ jzReported: e.target.checked })}
            className="h-4 w-4 accent-[#0A4747]" />
          JZ reported
        </label>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">Do not enter patient names or identifiers.</p>
        <button type="button" className={buttonClass} onClick={onFind}>
          Find drug
        </button>
      </div>
    </section>
  );
}
