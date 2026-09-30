"use client";

import { useRouter } from "next/navigation";
import { ArrowUpDown } from "lucide-react";
import { Select } from "@/components/ui/select";

export function StoreSortSelect({ options, value }: { options: { value: string; label: string; href: string }[]; value: string }) {
  const router = useRouter();
  return (
    <div className="store-sort store-sort-custom">
      <Select
        ariaLabel="Ordenar por"
        className="store-sort-trigger"
        icon={<ArrowUpDown size={15} />}
        onChange={(nextValue) => {
          const next = options.find((option) => option.value === nextValue);
          if (next) router.push(next.href, { scroll: false });
        }}
        options={options.map(({ value: optionValue, label }) => ({ value: optionValue, label }))}
        searchable={false}
        value={value}
      />
    </div>
  );
}
