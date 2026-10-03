"use client";

type BarItem = {
  label: string;
  count: number;
};

type SimpleBarChartProps = {
  items: BarItem[];
  emptyLabel?: string;
};

export function SimpleBarChart({
  items,
  emptyLabel = "No data yet",
}: SimpleBarChartProps) {
  const max = Math.max(0, ...items.map((i) => i.count));
  const visible = items.filter((i) => i.count > 0);
  const rows = visible.length > 0 ? visible : items;

  if (rows.length === 0 || (max === 0 && visible.length === 0)) {
    return (
      <p className="gg-empty text-sm text-[var(--muted)]">{emptyLabel}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((item) => {
        const width = max > 0 ? Math.max(4, Math.round((item.count / max) * 100)) : 0;
        return (
          <li key={item.label} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{item.label}</span>
              <span className="tabular-nums text-[var(--muted)]">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-[var(--border)]/60">
              <div
                className="h-full rounded bg-[var(--brand)] transition-[width] duration-300"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
