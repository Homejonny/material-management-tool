import { useState, useMemo } from "react";
import { useGetMaterials, useRefreshMaterials } from "@workspace/api-client-react";
import { PresenceBar, NameDialog, usePresence } from "@/components/PresenceBar";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, Search, ArrowUpDown, ArrowUp, ArrowDown, Package, AlertTriangle, CheckCircle2, RefreshCw, Radio, Info } from "lucide-react";

type Substitute = {
  st: string | number;
  opis: string;
  zaloga: number;
  cena: number;
  uom: string;
};

type Material = {
  st: string | number;
  opis: string;
  zaloga: number;
  cena: number;
  price_source: "unit_cost" | "price_list" | "missing";
  uom: string;
  replenishment: string;
  kolicina: number;
  totalSubStock: number;
  dejansko: number;
  order_multiple: number;
  order_qty: number;
  order_value: number;
  has_substitutes: boolean;
  nadomestki: Substitute[];
};

function fmtSt(st: string | number) {
  return String(st).padStart(6, "0");
}

function fmt(n: number, decimals = 2) {
  if (n === 0) return "0";
  return n.toLocaleString("sl-SI", { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function fmtPrice(n: number) {
  if (n === 0) return "—";
  return n.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + " €";
}

function StatusBadge({ dejansko, kolicina }: { dejansko: number; kolicina: number }) {
  if (dejansko === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <CheckCircle2 className="w-3 h-3" />
        Pokrito
      </span>
    );
  }
  const pct = (dejansko / kolicina) * 100;
  if (pct >= 80) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
        <AlertTriangle className="w-3 h-3" />
        Naroči
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <AlertTriangle className="w-3 h-3" />
      Delno
    </span>
  );
}

function SubstitutesDropdown({ nadomestki }: { nadomestki: Substitute[]; has_substitutes: boolean }) {
  const [open, setOpen] = useState(false);
  if (nadomestki.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }
  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Package className="w-3 h-3" />
        {nadomestki.length} nadomestk{nadomestki.length === 1 ? "i" : "i"}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Št.</th>
                <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Opis</th>
                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Zaloga (kg)</th>
                <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Cena</th>
              </tr>
            </thead>
            <tbody>
              {nadomestki.map((sub, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{fmtSt(sub.st)}</td>
                  <td className="px-3 py-1.5 text-foreground max-w-xs">{sub.opis}</td>
                  <td className="px-3 py-1.5 text-right font-medium">
                    {sub.zaloga > 0 ? (
                      <span className="text-emerald-600">{fmt(sub.zaloga)}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtPrice(sub.cena)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (!sorted) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground/50 ml-1 shrink-0" />;
  if (sorted === "asc") return <ArrowUp className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />;
  return <ArrowDown className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />;
}

export default function MaterialsPage() {
  const { data: materials, isLoading, isError, refetch, dataUpdatedAt } = useGetMaterials();
  const { name, confirmName } = usePresence();
  const { mutate: refreshMaterials, isPending: isRefreshing } = useRefreshMaterials({
    mutation: { onSuccess: () => refetch() },
  });
  const [sorting, setSorting] = useState<SortingState>([{ id: "st", desc: false }]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "narociti" | "pokrito">("all");
  const [reprFilter, setReprFilter] = useState<"all" | "Nabava" | "Delovni nalog">("Nabava");

  const filteredData = useMemo(() => {
    if (!materials) return [];
    let data = materials as Material[];
    if (reprFilter !== "all") data = data.filter(m => m.replenishment === reprFilter);
    if (filterMode === "narociti") data = data.filter(m => m.dejansko > 0);
    if (filterMode === "pokrito") data = data.filter(m => m.dejansko === 0);
    return data;
  }, [materials, filterMode, reprFilter]);

  const columns = useMemo<ColumnDef<Material>[]>(() => [
    {
      accessorKey: "st",
      header: "Št.",
      size: 70,
      cell: info => <span className="font-mono text-xs text-muted-foreground">{fmtSt(info.getValue() as string | number)}</span>,
    },
    {
      accessorKey: "opis",
      header: "Opis materiala",
      size: 280,
      cell: info => (
        <span className="text-sm font-medium text-foreground leading-tight">{String(info.getValue())}</span>
      ),
    },
    {
      accessorKey: "zaloga",
      header: "Zaloga",
      size: 110,
      cell: info => {
        const v = info.getValue() as number;
        const uom = (info.row.original as Material).uom;
        return (
          <span className={v > 0 ? "text-foreground font-medium" : "text-muted-foreground"}>
            {fmt(v)}
            {uom && <span className="ml-1 text-xs text-muted-foreground">{uom}</span>}
          </span>
        );
      },
    },
    {
      accessorKey: "cena",
      header: "Cena / enoto",
      size: 130,
      cell: info => {
        const m = info.row.original as Material;
        const uom = m.uom;
        if (m.price_source === "missing") {
          return (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Ni cene
            </span>
          );
        }
        return (
          <span className="text-muted-foreground inline-flex items-center gap-1">
            {fmtPrice(info.getValue() as number)}
            {uom && <span className="text-xs opacity-60">/{uom}</span>}
            {m.price_source === "price_list" && (
              <span title="Cena iz cenika (tabela 7012)">
                <Info className="w-3 h-3 text-blue-400 shrink-0" />
              </span>
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "kolicina",
      header: "Potrebna kol.",
      size: 110,
      cell: info => {
        const uom = (info.row.original as Material).uom;
        return (
          <span className="font-medium">
            {fmt(info.getValue() as number)}
            {uom && <span className="ml-1 text-xs text-muted-foreground">{uom}</span>}
          </span>
        );
      },
    },
    {
      accessorKey: "totalSubStock",
      header: "Zaloga nadomestkov",
      size: 130,
      cell: info => {
        const v = info.getValue() as number;
        return <span className={v > 0 ? "text-blue-600 font-medium" : "text-muted-foreground"}>{fmt(v)}</span>;
      },
    },
    {
      accessorKey: "order_qty",
      header: "Za naročiti",
      size: 120,
      cell: info => {
        const m = info.row.original as Material;
        const v = m.order_qty ?? m.dejansko;
        const uom = m.uom;
        if (!v || v === 0) return <span className="font-bold text-emerald-600">0</span>;
        return (
          <div className="flex flex-col items-end">
            <span className="font-bold text-red-600">
              {fmt(v)}
              {uom && <span className="ml-1 text-xs font-normal text-red-400">{uom}</span>}
            </span>
            {(m.order_multiple ?? 0) > 0 && v !== m.dejansko && (
              <span className="text-[10px] text-muted-foreground">
                ({fmt(m.dejansko)} × {fmt(m.order_multiple)})
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "order_value",
      header: "Vrednost naročila",
      size: 150,
      cell: info => {
        const v = info.getValue() as number | undefined;
        if (!v || v === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <span className="font-medium text-foreground">
            {v.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      size: 90,
      enableSorting: false,
      cell: ({ row }) => (
        <StatusBadge dejansko={row.original.dejansko} kolicina={row.original.kolicina} />
      ),
    },
    {
      accessorKey: "nadomestki",
      header: "Nadomestni materiali",
      size: 200,
      enableSorting: false,
      filterFn: undefined,
      cell: ({ row }) => <SubstitutesDropdown nadomestki={row.original.nadomestki} has_substitutes={row.original.has_substitutes} />,
    },
  ], []);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      const q = String(filterValue).toLowerCase();
      const m = row.original as Material;
      return (
        String(m.st).includes(q) ||
        m.opis.toLowerCase().includes(q) ||
        m.nadomestki.some(s => s.opis.toLowerCase().includes(q))
      );
    },
  });

  const toOrder = useMemo(() => filteredData.filter(m => m.dejansko > 0).length, [filteredData]);
  const covered = useMemo(() => filteredData.filter(m => m.dejansko === 0).length, [filteredData]);
  const totalOrderValue = useMemo(() => filteredData.reduce((s, m) => s + (m.order_value ?? (m.order_qty ?? m.dejansko) * m.cena), 0), [filteredData]);
  const missingPrice = useMemo(() => filteredData.filter(m => m.price_source === "missing").length, [filteredData]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Nalaganje podatkov...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-foreground font-medium">Napaka pri nalaganju</p>
          <p className="text-muted-foreground text-sm">Preveri, ali strežnik deluje.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {!name && <NameDialog onConfirm={confirmName} />}
      <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Pregled nabave materialov</h1>
            <p className="text-muted-foreground text-sm">
              Formula: Zaloga osnovnega materiala + Zaloge nadomestkov &minus; Potrebna količina = Dejansko za naročiti
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <Radio className="w-3 h-3 animate-pulse" />
                Živi podatki iz Business Central
              </span>
              {dataUpdatedAt > 0 && (
                <span className="text-xs text-muted-foreground">
                  · osveženo ob {new Date(dataUpdatedAt).toLocaleTimeString("sl-SI")}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {name && <PresenceBar name={name} />}
            <button
              onClick={() => refreshMaterials()}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-border bg-card text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              title="Prisilna osvežitev podatkov iz BC"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Osvežujem..." : "Osveži BC"}
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Skupaj materialov</p>
            <p className="text-2xl font-bold text-foreground">{filteredData.length}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-1">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide">Za naročiti</p>
            <p className="text-2xl font-bold text-red-700">{toOrder}</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-1">
            <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Pokrito (z zalogami)</p>
            <p className="text-2xl font-bold text-emerald-700">{covered}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ocenjena vrednost nabave</p>
            <p className="text-2xl font-bold text-foreground">{totalOrderValue.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</p>
          </div>
          <div className={`rounded-xl border p-4 space-y-1 ${missingPrice > 0 ? "border-amber-200 bg-amber-50" : "border-border bg-card"}`}>
            <p className={`text-xs font-medium uppercase tracking-wide ${missingPrice > 0 ? "text-amber-600" : "text-muted-foreground"}`}>Brez cene</p>
            <p className={`text-2xl font-bold ${missingPrice > 0 ? "text-amber-700" : "text-foreground"}`}>{missingPrice}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                placeholder="Iskanje po opisu, šifri..."
                value={globalFilter}
                onChange={e => setGlobalFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Replenishment filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Obnova zaloge:</span>
              {(["all", "Nabava", "Delovni nalog"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setReprFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    reprFilter === r
                      ? r === "Delovni nalog"
                        ? "bg-purple-600 text-white"
                        : "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                >
                  {r === "all" ? "Vse" : r === "Nabava" ? "Nabava" : "Polizdelki"}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5">
              {(["all", "narociti", "pokrito"] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    filterMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                  }`}
                >
                  {mode === "all" ? "Vsi" : mode === "narociti" ? "Za naročiti" : "Pokrito"}
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground ml-auto">
              {table.getFilteredRowModel().rows.length} / {(materials as Material[])?.length ?? 0} materialov
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                {table.getHeaderGroups().map(hg => (
                  <tr key={hg.id} className="border-b border-border bg-muted/95 backdrop-blur-sm">
                    {hg.headers.map(header => (
                      <th
                        key={header.id}
                        style={{ width: header.column.getSize() }}
                        className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide ${
                          header.column.getCanSort() ? "cursor-pointer select-none hover:text-foreground transition-colors" : ""
                        }`}
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="flex items-center gap-0.5">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.column.getCanSort() && (
                            <SortIcon sorted={header.column.getIsSorted()} />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30 ${
                      idx % 2 === 0 ? "" : "bg-muted/10"
                    } ${row.original.dejansko > 0 ? "hover:bg-red-50/30" : ""}`}
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.getFilteredRowModel().rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground">
                      Ni rezultatov za vaše iskanje.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Podatki iz delovnih listov načrtovanja &bull; {new Date().toLocaleDateString("sl-SI")}
        </p>
      </div>
    </div>
  );
}
