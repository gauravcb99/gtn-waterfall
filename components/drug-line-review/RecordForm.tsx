"use client";

import type { ContractType, DoseUnit, Drug } from "@/lib/drug-line-review/types";
import type { RecordFormState } from "./forms";
import { displayTitle, sourceById } from "./sources";
import { buttonClass, CardTitle, cardClass, Field, inputClass } from "./ui";

const DOSE_UNITS: DoseUnit[] = ["units", "mg", "mg/kg", "mg/m2"];
const CONTRACTS: { value: ContractType; label: string }[] = [
  { value: "asp_fee_schedule", label: "ASP fee schedule (% of CMS payment limit)" },
  { value: "percent_of_charges", label: "Percent of charges" },
  { value: "inpatient_drg", label: "Inpatient DRG" },
  { value: "stoploss_outlier_carveout", label: "Stop-loss / outlier carve-out" },
  { value: "reference_based", label: "Reference-based pricing" },
];

type Props = {
  drug: Drug;
  record: RecordFormState;
  onChange: (patch: Partial<RecordFormState>) => void;
  onRun: () => void;
  error: string | null;
};

export default function RecordForm({ drug, record, onChange, onRun, error }: Props) {
  const entry = drug.dosing.find((x) => x.id === record.indicationId);
  const labelSource = entry ? sourceById(entry.dose.cite.source) : undefined;
  const labeledSizes = drug.vialSizes.map((v) => `${v.value.amount} ${v.value.unit}`).join(", ");

  return (
    <section className={cardClass}>
      <CardTitle step={3}>Record and contract</CardTitle>
      <Field label="Indication">
        <select className={inputClass} value={record.indicationId} onChange={(e) => onChange({ indicationId: e.target.value })}>
          <option value="">Not selected</option>
          {drug.dosing.map((x) => (
            <option key={x.id} value={x.id}>
              {x.indication.value}
            </option>
          ))}
          <option value="other">Other / not listed</option>
        </select>
      </Field>
      {entry && (
        <div className="rounded-lg border-l-4 border-[#C9A86A] bg-cream p-3 text-xs flex flex-col gap-1">
          <div className="font-semibold text-[#0A4747]">Label dose · section {entry.dose.cite.section}</div>
          <blockquote className="italic text-ink">&ldquo;{entry.dose.cite.quote}&rdquo;</blockquote>
          {labelSource && (
            <a href={labelSource.url} target="_blank" rel="noopener noreferrer" className="text-[#0A4747] underline">
              {displayTitle(labelSource)}
            </a>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Documented dose">
          <input type="number" step="any" className={inputClass} value={record.doseAmount}
            onChange={(e) => onChange({ doseAmount: e.target.value })} />
        </Field>
        <Field label="Dose unit">
          <select className={inputClass} value={record.doseUnit} onChange={(e) => onChange({ doseUnit: e.target.value as DoseUnit | "" })}>
            <option value="">Choose…</option>
            {DOSE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        {record.doseUnit === "mg/kg" && (
          <Field label="Weight (kg)">
            <input type="number" step="any" className={inputClass} value={record.weightKg}
              onChange={(e) => onChange({ weightKg: e.target.value })} />
          </Field>
        )}
        {record.doseUnit === "mg/m2" && (
          <Field label="BSA (m2)" hint="As documented in the record, not calculated">
            <input type="number" step="any" className={inputClass} value={record.bsaM2}
              onChange={(e) => onChange({ bsaM2: e.target.value })} />
          </Field>
        )}
      </div>

      <Field label="Vial sizes used" hint={`Optional, comma-separated. Labeled sizes: ${labeledSizes}`}>
        <input className={inputClass} value={record.vials} onChange={(e) => onChange({ vials: e.target.value })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contract type">
          <select className={inputClass} value={record.contractType}
            onChange={(e) => onChange({ contractType: e.target.value as ContractType | "" })}>
            <option value="">Choose…</option>
            {CONTRACTS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {record.contractType === "asp_fee_schedule" && (
          <Field label="% of CMS payment limit">
            <input type="number" step="any" className={inputClass} value={record.aspContractPercent}
              onChange={(e) => onChange({ aspContractPercent: e.target.value })} />
          </Field>
        )}
        {record.contractType === "percent_of_charges" && (
          <Field label="% of billed charges">
            <input type="number" step="any" className={inputClass} value={record.chargesContractPercent}
              onChange={(e) => onChange({ chargesContractPercent: e.target.value })} />
          </Field>
        )}
      </div>

      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end">
        <button type="button" className={buttonClass} onClick={onRun}>
          Run checks
        </button>
      </div>
    </section>
  );
}
