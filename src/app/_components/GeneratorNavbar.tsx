"use client";

import Link from "next/link";

type GeneratorNavbarProps = {
  active: "accounting" | "pelunasan-penjualan";
};

const NAV_ITEMS = [
  {
    key: "accounting",
    href: "/accounting",
    label: "Pembelian & Penjualan",
  },
  {
    key: "pelunasan-penjualan",
    href: "/pelunasan-penjualan",
    label: "Pelunasan Penjualan",
  },
] as const;

export function GeneratorNavbar({ active }: GeneratorNavbarProps) {
  return (
    <nav className="rounded-2xl border bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={[
                "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
