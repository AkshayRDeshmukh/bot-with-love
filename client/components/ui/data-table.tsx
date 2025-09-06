import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
};

export type FilterConfig<T> = {
  label: string;
  key: keyof T | string;
  options: { label: string; value: string }[];
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  getRowId,
  searchKeys,
  filters = [],
  initialSort = null,
  pageSizeOptions = [10, 25, 50],
  actions,
  onRowClick,
}: {
  columns: Column<T>[];
  data: T[];
  getRowId: (row: T) => string;
  searchKeys?: (keyof T | string)[];
  filters?: FilterConfig<T>[];
  initialSort?: SortState;
  pageSizeOptions?: number[];
  actions?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>(
    {},
  );
  const [sort, setSort] = useState<SortState>(initialSort);
  const [pageSize, setPageSize] = useState(pageSizeOptions[0] ?? 10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let out = data;
    // search
    if (query.trim()) {
      const q = query.toLowerCase();
      out = out.filter((row) => {
        const keys =
          searchKeys && searchKeys.length > 0 ? searchKeys : Object.keys(row);
        return keys.some((k) =>
          String(row[k as string] ?? "")
            .toLowerCase()
            .includes(q),
        );
      });
    }
    // filters
    for (const [k, v] of Object.entries(activeFilters)) {
      if (!v) continue;
      out = out.filter((row) => String(row[k] ?? "") === v);
    }
    // sorting
    if (sort) {
      const { key, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av == null && bv == null) return 0;
        if (av == null) return dir === "asc" ? -1 : 1;
        if (bv == null) return dir === "asc" ? 1 : -1;
        if (typeof av === "number" && typeof bv === "number")
          return dir === "asc" ? av - bv : bv - av;
        return dir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      });
    }
    return out;
  }, [data, query, searchKeys, activeFilters, sort]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, pageSize, currentPage]);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // remove sorting on third click
    });
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Controls */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sticky top-0 z-10 bg-card rounded-t-xl border-b">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
              placeholder="Search..."
              className="h-9 w-64 rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {filters.map((f) => (
            <select
              key={String(f.key)}
              value={activeFilters[String(f.key)] ?? ""}
              onChange={(e) => {
                setPage(1);
                setActiveFilters((p) => ({
                  ...p,
                  [String(f.key)]: e.target.value,
                }));
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">{f.label}: All</option>
              {f.options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
            className="h-8 rounded-md border bg-background px-2"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="relative w-full overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="bg-card">
            <tr className="border-b">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={cn(
                    "h-11 px-4 text-left align-middle font-semibold text-foreground",
                    col.className,
                  )}
                >
                  <div className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-1 hover:bg-transparent"
                        onClick={() => toggleSort(String(col.key))}
                      >
                        <ArrowUpDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </th>
              ))}
              {actions && (
                <th className="h-11 px-4 text-right align-middle font-semibold text-foreground">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, idx) => (
              <tr
                key={getRowId(row)}
                className={cn(
                  "border-b transition-colors hover:bg-accent/40",
                  idx % 2 === 1 ? "bg-muted/30" : undefined,
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={cn("p-4 align-middle", col.className)}
                  >
                    {col.render
                      ? col.render(row)
                      : String(row[col.key as string] ?? "")}
                  </td>
                ))}
                {actions && (
                  <td className="p-4 align-middle">
                    <div className="flex items-center justify-end gap-1">
                      {actions(row) || (
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td
                  className="p-6 text-center text-muted-foreground"
                  colSpan={columns.length + (actions ? 1 : 0)}
                >
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between p-3">
        <div className="text-xs text-muted-foreground">
          Page {currentPage} of {totalPages} • {total} total
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
