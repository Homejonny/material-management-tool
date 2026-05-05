import { useState, useMemo } from "react";
import { useGetSchedule } from "@workspace/api-client-react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import * as XLSX from "xlsx";

type ScheduleLine = {
  item_no: string;
  opis: string;
  prod_order_no: string;
  status: string;
  remaining_qty: number;
  uom: string;
  due_date: string;
  urgency_days: number;
  item_stock: number;
  sub_stock: number;
  total_available: number;
  cena: number;
  vendor_no: string;
  vendor_name: string;
  lead_time: string;
  lead_time_days: number;
};

function fmt(n: number, dec = 2) {
  if (n === 0) return "0";
  return n.toLocaleString("sl-SI", { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

function fmtDate(d: string) {
  if (!d || d === "0001-01-01") return "—";
  const parts = d.split("T")[0].split("-");
  if (parts.length < 3) return d;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

type Urgency = "preteklo" | "teden" | "mesec" | "pozneje";

function getUrgency(days: number): Urgency {
  if (days < 0) return "preteklo";
  if (days <= 7) return "teden";
  if (days <= 30) return "mesec";
  return "pozneje";
}

function UrgencyBadge({ days }: { days: number }) {
  const u = getUrgency(days);
  if (u === "preteklo")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
        <AlertTriangle className="w-3 h-3" />
        Zamuda {Math.abs(days)}d
      </span>
    );
  if (u === "teden")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
        <AlertTriangle className="w-3 h-3" />
        {days}d
      </span>
    );
  if (u === "mesec")
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
        <CalendarClock className="w-3 h-3" />
        {days}d
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" />
      {days === 9999 ? "Ni roka" : `${days}d`}
    </span>
  );
}

function CoverageCell({ remaining, available }: { remaining: number; available: number }) {
  const covered = available >= remaining;
  const pct = remaining > 0 ? Math.min(100, Math.round((available / remaining) * 100)) : 100;
  return (
    <div className="flex flex-col gap-1 min-w-[80px]">
      <div className="flex items-center gap-1">
        {covered ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
        )}
        <span className={`text-xs font-medium ${covered ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden w-full">
        <div
          className={`h-full rounded-full transition-all ${covered ? "bg-green-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function SortIcon({ isSorted }: { isSorted: false | "asc" | "desc" }) {
  if (!isSorted) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50" />;
  if (isSorted === "asc") return <ArrowUp className="w-3.5 h-3.5 text-primary" />;
  return <ArrowDown className="w-3.5 h-3.5 text-primary" />;
}

type FilterMode = "all" | "uncovered" | "preteklo" | "teden" | "mesec";

export default function SchedulePage() {
  const { data: rawLines, isLoading, isError, refetch, dataUpdatedAt } = useGetSchedule();
  const [sorting, setSorting] = useState<SortingState>([{ id: "due_date", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showOnlyUncovered, setShowOnlyUncovered] = useState(false);

  const lines = (rawLines ?? []) as ScheduleLine[];

  const filteredData = useMemo(() => {
    let data = lines;
    if (showOnlyUncovered) data = data.filter((r) => r.total_available < r.remaining_qty);
    if (filterMode === "preteklo") data = data.filter((r) => r.urgency_days < 0);
    else if (filterMode === "teden") data = data.filter((r) => r.urgency_days >= 0 && r.urgency_days <= 7);
    else if (filterMode === "mesec") data = data.filter((r) => r.urgency_days >= 0 && r.urgency_days <= 30);
    return data;
  }, [lines, showOnlyUncovered, filterMode]);

  const stats = useMemo(() => {
    const all = lines;
    return {
      total: all.length,
      preteklo: all.filter((r) => r.urgency_days < 0).length,
      teden: all.filter((r) => r.urgency_days >= 0 && r.urgency_days <= 7).length,
      mesec: all.filter((r) => r.urgency_days >= 0 && r.urgency_days <= 30).length,
      uncovered: all.filter((r) => r.total_available < r.remaining_qty).length,
    };
  }, [lines]);

  const columns = useMemo<ColumnDef<ScheduleLine>[]>(
    () => [
      {
        accessorKey: "due_date",
        header: "Rok",
        size: 95,
        cell: (info) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-mono font-medium">{fmtDate(info.getValue() as string)}</span>
            <UrgencyBadge days={(info.row.original as ScheduleLine).urgency_days} />
          </div>
        ),
        sortingFn: (a, b) => {
          const da = a.original.due_date || "9999";
          const db = b.original.due_date || "9999";
          return da.localeCompare(db);
        },
      },
      {
        accessorKey: "prod_order_no",
        header: "Delovni nalog",
        size: 130,
        cell: (info) => (
          <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: "item_no",
        header: "Šifra",
        size: 70,
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">{String(info.getValue()).padStart(6, "0")}</span>
        ),
      },
      {
        accessorKey: "opis",
        header: "Material",
        size: 260,
        cell: (info) => (
          <span className="text-sm font-medium leading-tight">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status DN",
        size: 110,
        cell: (info) => {
          const s = String(info.getValue());
          const cls =
            s === "Izdano"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : s === "Potrjen"
              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
              : "bg-muted text-muted-foreground";
          return (
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{s}</span>
          );
        },
      },
      {
        accessorKey: "remaining_qty",
        header: "Potreba",
        size: 90,
        cell: (info) => (
          <span className="text-sm tabular-nums text-right block">{fmt(info.getValue() as number, 3)}</span>
        ),
      },
      {
        accessorKey: "item_stock",
        header: "Zaloga",
        size: 90,
        cell: (info) => {
          const v = info.getValue() as number;
          return (
            <span className={`text-sm tabular-nums text-right block ${v > 0 ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
              {fmt(v, 3)}
            </span>
          );
        },
      },
      {
        accessorKey: "sub_stock",
        header: "Zal. nadom.",
        size: 90,
        cell: (info) => {
          const v = info.getValue() as number;
          return (
            <span className={`text-sm tabular-nums text-right block ${v > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}>
              {v > 0 ? fmt(v, 3) : "—"}
            </span>
          );
        },
      },
      {
        id: "coverage",
        header: "Pokritost",
        size: 90,
        enableSorting: false,
        cell: (info) => (
          <CoverageCell
            remaining={(info.row.original as ScheduleLine).remaining_qty}
            available={(info.row.original as ScheduleLine).total_available}
          />
        ),
      },
      {
        accessorKey: "vendor_name",
        header: "Dobavitelj",
        size: 160,
        cell: (info) => (
          <span className="text-xs text-muted-foreground leading-tight">{String(info.getValue())}</span>
        ),
      },
      {
        accessorKey: "lead_time",
        header: "Dobavni rok",
        size: 90,
        cell: (info) => (
          <span className="text-xs tabular-nums font-mono">{String(info.getValue())}</span>
        ),
      },
    ],
    []
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _colId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      const r = row.original as ScheduleLine;
      return (
        r.item_no.toLowerCase().includes(q) ||
        r.opis.toLowerCase().includes(q) ||
        r.prod_order_no.toLowerCase().includes(q) ||
        r.vendor_name.toLowerCase().includes(q)
      );
    },
  });

  function exportToExcel() {
    const exportData = filteredData.map((r) => ({
      "Rok (due date)": fmtDate(r.due_date),
      "Dni do roka": r.urgency_days === 9999 ? "" : r.urgency_days,
      "Delovni nalog": r.prod_order_no,
      "Status DN": r.status,
      "Šifra materiala": r.item_no.padStart(6, "0"),
      Material: r.opis,
      Potreba: r.remaining_qty,
      Zaloga: r.item_stock,
      "Zaloga nadomestkov": r.sub_stock,
      "Skupaj razpoložljivo": r.total_available,
      "Cena (€/enoto)": r.cena,
      Dobavitelj: r.vendor_name,
      "Dobavni rok": r.lead_time,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Terminski plan");
    XLSX.writeFile(wb, `terminski-plan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const updatedAt = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("sl-SI", { hour: "2-digit", minute: "2-digit" })
    : null;

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          <p className="text-sm text-muted-foreground">Nalagam terminski plan...</p>
        </div>
      </div>
    );

  if (isError)
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Napaka pri nalaganju terminskega plana.</p>
          <button onClick={() => refetch()} className="text-sm text-primary underline">
            Poskusi znova
          </button>
        </div>
      </div>
    );

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setFilterMode(filterMode === "preteklo" ? "all" : "preteklo")}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            filterMode === "preteklo"
              ? "border-red-400 bg-red-50 dark:bg-red-950/20 ring-1 ring-red-400"
              : "border-border bg-card hover:border-red-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Zamuda</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{stats.preteklo}</div>
          <div className="text-xs text-muted-foreground mt-0.5">vrstic po roku</div>
        </button>

        <button
          onClick={() => setFilterMode(filterMode === "teden" ? "all" : "teden")}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            filterMode === "teden"
              ? "border-orange-400 bg-orange-50 dark:bg-orange-950/20 ring-1 ring-orange-400"
              : "border-border bg-card hover:border-orange-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ta teden</span>
          </div>
          <div className="text-2xl font-bold text-orange-600">{stats.teden}</div>
          <div className="text-xs text-muted-foreground mt-0.5">rok v 7 dneh</div>
        </button>

        <button
          onClick={() => setFilterMode(filterMode === "mesec" ? "all" : "mesec")}
          className={`rounded-xl border p-4 text-left transition-all hover:shadow-md ${
            filterMode === "mesec"
              ? "border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 ring-1 ring-yellow-400"
              : "border-border bg-card hover:border-yellow-300"
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-yellow-500" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ta mesec</span>
          </div>
          <div className="text-2xl font-bold text-yellow-600">{stats.mesec}</div>
          <div className="text-xs text-muted-foreground mt-0.5">rok v 30 dneh</div>
        </button>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skupaj</span>
          </div>
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            vrstic · {stats.uncovered} nepokritih
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Išči material, nalog, dobavitelja..."
            className="pl-9 pr-4 h-9 w-full rounded-md border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showOnlyUncovered}
            onChange={(e) => setShowOnlyUncovered(e.target.checked)}
            className="rounded"
          />
          Samo nepokrite
        </label>

        {filterMode !== "all" && (
          <button
            onClick={() => setFilterMode("all")}
            className="h-9 px-3 rounded-md text-sm border border-border bg-muted hover:bg-muted/80 transition-colors"
          >
            Počisti filter
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-muted-foreground hidden sm:inline">Posodobljeno: {updatedAt}</span>
          )}
          <button
            onClick={() => refetch()}
            className="h-9 px-3 rounded-md text-sm border border-border bg-background hover:bg-muted transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Osveži
          </button>
          <button
            onClick={exportToExcel}
            className="h-9 px-3 rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-border bg-muted/40">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      style={{ width: h.getSize() }}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                    >
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button
                          onClick={h.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          <SortIcon isSorted={h.column.getIsSorted()} />
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    Ni rezultatov
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row, i) => {
                  const r = row.original as ScheduleLine;
                  const u = getUrgency(r.urgency_days);
                  const rowCls =
                    u === "preteklo"
                      ? "bg-red-50/40 dark:bg-red-950/10 hover:bg-red-50/70 dark:hover:bg-red-950/20"
                      : u === "teden"
                      ? "bg-orange-50/40 dark:bg-orange-950/10 hover:bg-orange-50/70"
                      : i % 2 === 0
                      ? "hover:bg-muted/30"
                      : "bg-muted/10 hover:bg-muted/30";

                  return (
                    <tr key={row.id} className={`border-b border-border/50 transition-colors ${rowCls}`}>
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 align-middle">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-xs text-muted-foreground">
          {table.getRowModel().rows.length} od {lines.length} vrstic
        </div>
      </div>
    </div>
  );
}
