"use client";

import { useRouter } from "next/navigation";
import { ArrowUpDown } from "lucide-react";

export function StoreSortSelect({ options, value }: { options: { value: string; label: string; href: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="store-sort">
      <ArrowUpDown aria-hidden="true" size={15} />
      <span className="sr-only">Ordenar por</span>
      <select
        aria-label="Ordenar por"
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) router.push(next.href, { scroll: false });
        }}
        value={value}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
