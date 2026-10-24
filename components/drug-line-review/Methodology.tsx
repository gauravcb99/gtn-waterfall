"use client";

import { displayTitle, sources } from "./sources";

export default function Methodology() {
  return (
    <details className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
      <summary className="cursor-pointer text-base font-bold text-[#0A4747]">Methodology and sources</summary>
      <ul className="mt-4 flex flex-col gap-3">
        {sources.map((s) => (
          <li key={s.id} className="rounded-lg border-l-4 border-[#0A4747] bg-[#F8FAFA] p-3 text-xs flex flex-col gap-1">
            <div className="font-semibold text-[#0A4747]">{displayTitle(s)}</div>
            <div className="text-gray-500">{s.publisher}</div>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#0A4747] underline break-all">
              {s.url}
            </a>
            {s.file && <div className="text-ink">File: {s.file}</div>}
            <div className="text-ink">Version / date: {s.version}</div>
            {s.quarter && <div className="text-ink">Quarter: {s.quarter}{s.effective && ` (effective ${s.effective})`}</div>}
            <div className="text-ink">Downloaded: {s.downloadDate}</div>
          </li>
        ))}
      </ul>
    </details>
  );
}
