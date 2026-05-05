import { useState, useMemo } from "react";
import { useGetOrderSuggestions } from "@workspace/api-client-react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Truck, Download, Building2 } from "lucide-react";
import * as XLSX from "xlsx";

type OrderSuggestion = {
  st: string;
  opis: string;
  dejansko: number;
  vendor_no: string;
  vendor_name: string;
  vendor_item_no: string;
  lead_time: string;
  lead_time_days: number;
  order_date: string;
  receipt_date: string;
  replenishment_system: string;
};

type SortKey = keyof OrderSuggestion;
type SortDir = "asc" | "desc";

function fmt(n: number) {
  return n.toLocaleString("sl-SI", { maximumFractionDigits: 3 });
}

function fmtDate(iso: string) {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("sl-SI", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function urgencyColor(days: number): string {
  if (days === 0) return "text-red-600 font-semibold";
  if (days <= 14) return "text-orange-500 font-semibold";
  if (days <= 30) return "text-yellow-600";
  return "text-emerald-600";
}

function urgencyBadge(days: number): { label: string; cls: string } {
  if (days === 0) return { label: "Takoj", cls: "bg-red-100 text-red-700 border-red-200" };
  if (days <= 14) return { label: "Nujno", cls: "bg-orange-100 text-orange-700 border-orange-200" };
  if (days <= 30) return { label: "Kmalu", cls: "bg-yellow-100 text-yellow-700 border-yellow-200" };
  return { label: "Normalno", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

export default function OrdersPage() {
  const { data: orders, isLoading, isError } = useGetOrderSuggestions();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("st");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    if (!orders) return [];
    const q = search.toLowerCase();
    return (orders as OrderSuggestion[]).filter(
      (o) =>
        o.st.includes(q) ||
        o.opis.toLowerCase().includes(q) ||
        o.vendor_name.toLowerCase().includes(q) ||
        o.vendor_item_no.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "sl");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground ml-1 shrink-0" />;
    return sortDir === "asc"
      ? <ArrowUp className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />
      : <ArrowDown className="w-3.5 h-3.5 text-primary ml-1 shrink-0" />;
  }

  function exportExcel() {
    if (!sorted.length) return;
    const rows = sorted.map((o) => ({
      "Šifra artikla": o.st,
      "Opis": o.opis,
      "Dobavitelj": o.vendor_name,
      "Šifra pri dobavitelju": o.vendor_item_no || "—",
      "Čas dobave": o.lead_time,
      "Dnevi dobave": o.lead_time_days,
      "Količina za naročiti": o.dejansko,
      "Datum naročila": o.order_date,
      "Predviden datum prejema": o.receipt_date === "—" ? "—" : o.receipt_date,
      "Sistem dopolnjevanja": o.replenishment_system,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 14 }, { wch: 45 }, { wch: 30 }, { wch: 22 },
      { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 22 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Predlagani datumi naročila");
    XLSX.writeFile(wb, `narocila_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const byVendor = useMemo(() => {
    const m = new Map<string, number>();
    (orders as OrderSuggestion[] | undefined)?.forEach((o) => {
      m.set(o.vendor_name, (m.get(o.vendor_name) ?? 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [orders]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground text-sm">Nalagam podatke iz Business Central...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-destructive">Napaka pri nalaganju podatkov.</p>
      </div>
    );
  }

  const total = (orders as OrderSuggestion[] | undefined)?.length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Predlagani datumi naročila</h1>
          <p className="text-muted-foreground text-sm">
            Materiali za naročilo z dobavitelji in predvidenimi datumi prejema glede na čas dobave iz BC
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Za naročiti</p>
            <p className="text-3xl font-bold text-foreground">{total}</p>
            <p className="text-xs text-muted-foreground">materialov</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Dobaviteljev</p>
            <p className="text-3xl font-bold text-foreground">{byVendor.length}</p>
            <p className="text-xs text-muted-foreground">različnih</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nujno (&le;14 dni)</p>
            <p className="text-3xl font-bold text-orange-500">
              {(orders as OrderSuggestion[] | undefined)?.filter((o) => o.lead_time_days <= 14).length ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">materialov</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Datum naročila</p>
            <p className="text-xl font-bold text-foreground">{fmtDate(new Date().toISOString().slice(0, 10))}</p>
            <p className="text-xs text-muted-foreground">danes</p>
          </div>
        </div>

        {/* Top vendors */}
        {byVendor.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Naročila po dobaviteljih
            </p>
            <div className="flex flex-wrap gap-2">
              {byVendor.map(([name, count]) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border bg-muted text-xs font-medium text-foreground cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => setSearch(name)}
                >
                  {name}
                  <span className="bg-primary/10 text-primary rounded-full px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Search + Export */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Išči po šifri, opisu, dobavitelju..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <span className="text-sm text-muted-foreground">{sorted.length} materialov</span>
          <button
            onClick={exportExcel}
            className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Izvozi Excel
          </button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50 sticky top-0 z-10">
                  {(
                    [
                      { key: "st", label: "Šifra" },
                      { key: "opis", label: "Opis artikla" },
                      { key: "vendor_name", label: "Dobavitelj" },
                      { key: "vendor_item_no", label: "Šifra pri dob." },
                      { key: "lead_time", label: "Čas dobave" },
                      { key: "dejansko", label: "Kol. za naročiti" },
                      { key: "order_date", label: "Datum naročila" },
                      { key: "receipt_date", label: "Predviden prejem" },
                    ] as { key: SortKey; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={key}
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort(key)}
                    >
                      <span className="inline-flex items-center">
                        {label}
                        <SortIcon col={key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    Nujnost
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      Ni rezultatov.
                    </td>
                  </tr>
                )}
                {sorted.map((o, i) => {
                  const badge = urgencyBadge(o.lead_time_days);
                  return (
                    <tr
                      key={o.st}
                      className={`border-b border-border last:border-0 transition-colors hover:bg-muted/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-medium text-foreground whitespace-nowrap">{o.st}</td>
                      <td className="px-4 py-3 text-foreground max-w-[280px]">
                        <span className="line-clamp-2">{o.opis}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className={o.vendor_name === "Ni določen" ? "text-muted-foreground italic" : "text-foreground font-medium"}>
                            {o.vendor_name}
                          </span>
                        </div>
                        {o.vendor_no && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">{o.vendor_no}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        {o.vendor_item_no || "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={urgencyColor(o.lead_time_days)}>{o.lead_time}</span>
                        {o.lead_time_days > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">({o.lead_time_days}d)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">
                        {fmt(o.dejansko)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          {fmtDate(o.order_date)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className={o.receipt_date === "—" ? "text-muted-foreground" : "text-foreground font-medium"}>
                            {fmtDate(o.receipt_date)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
