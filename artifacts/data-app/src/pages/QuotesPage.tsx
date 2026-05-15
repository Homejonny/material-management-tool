import { useState, useEffect, useRef, useCallback } from "react";
import {
  Upload, FileText, Trash2, CheckCircle2, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Inbox, Star, Package
} from "lucide-react";

type ParsedLine = {
  vendor_name: string;
  item_no: string;
  item_description: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  uom: string;
  delivery_days: number | null;
  valid_until: string;
  notes: string;
};

type SavedQuote = {
  id: number;
  vendorName: string;
  vendorNo: string;
  itemNo: string;
  itemDescription: string;
  price: number | null;
  currency: string;
  quantity: number | null;
  uom: string;
  deliveryDays: number | null;
  validUntil: string;
  notes: string;
  sourceFile: string;
  createdAt: string;
};

type ComparisonGroup = {
  canonical_item_no: string;
  has_substitutes: boolean;
  substitute_item_nos: string[];
  quotes: (SavedQuote & { is_best_price: boolean })[];
};

type Tab = "inbox" | "comparison";

function fmtPrice(price: number | null, currency: string) {
  if (price == null) return "—";
  return `${price.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${currency}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("sl-SI");
  } catch { return iso; }
}

export default function QuotesPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{ lines: ParsedLine[]; source: string; rawText: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [editedLines, setEditedLines] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [quotes, setQuotes] = useState<SavedQuote[]>([]);
  const [comparison, setComparison] = useState<ComparisonGroup[]>([]);
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchQuotes = useCallback(() => {
    setLoadingQuotes(true);
    Promise.all([
      fetch("/api/quotes").then(r => r.json()),
      fetch("/api/quotes/comparison").then(r => r.json()),
    ]).then(([q, c]) => {
      setQuotes(q);
      setComparison(c);
      setLoadingQuotes(false);
    }).catch(() => setLoadingQuotes(false));
  }, []);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  async function parseText(text: string, source: string) {
    setParsing(true);
    setParseError(null);
    setParseResult(null);
    setSavedOk(false);
    try {
      const res = await fetch("/api/quotes/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error);
      setParseResult({ ...data, source });
      setEditedLines(data.lines);
    } catch (e) {
      setParseError(String(e));
    } finally {
      setParsing(false);
    }
  }

  async function parseFile(file: File) {
    setParsing(true);
    setParseError(null);
    setParseResult(null);
    setSavedOk(false);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/quotes/parse", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? data.error);
      setParseResult({ ...data, source: file.name });
      setEditedLines(data.lines);
    } catch (e) {
      setParseError(String(e));
    } finally {
      setParsing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  async function handleSave() {
    if (!editedLines.length || !parseResult) return;
    setSaving(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: editedLines,
          sourceFile: parseResult.source,
          rawText: parseResult.rawText,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSavedOk(true);
      setParseResult(null);
      setEditedLines([]);
      setPasteText("");
      fetchQuotes();
    } catch (e) {
      setParseError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    await fetch(`/api/quotes/${id}`, { method: "DELETE" });
    fetchQuotes();
  }

  function updateLine(i: number, field: keyof ParsedLine, value: string | number | null) {
    setEditedLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));
  }

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Prejete ponudbe</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Naloži odgovor dobavitelja (e-pošta, Word, TXT) — AI razčleni in primerja pogoje
          </p>
        </div>
        <button onClick={fetchQuotes} disabled={loadingQuotes}
          className="print:hidden flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingQuotes ? "animate-spin" : ""}`} />
          Osveži
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-5 bg-muted/40 p-1 rounded-lg w-fit">
        {([
          { id: "inbox", label: "Novi vnos", icon: <Inbox className="w-3.5 h-3.5" /> },
          { id: "comparison", label: `Primerjava (${quotes.length})`, icon: <Star className="w-3.5 h-3.5" /> },
        ] as { id: Tab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── INBOX TAB ── */}
      {tab === "inbox" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: upload + paste */}
          <div className="space-y-4">
            {/* Dropzone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}>
              <input ref={fileInputRef} type="file" accept=".txt,.docx,.doc,.png,.jpg,.jpeg,.webp,.gif" onChange={handleFileInput} className="hidden" />
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium text-sm text-foreground">Povleci datoteko sem ali klikni</p>
              <p className="text-xs text-muted-foreground mt-1">Sprejema: TXT, DOCX, PNG, JPG, WEBP · Max 10 MB</p>
            </div>

            {/* Paste area */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Ali prilepi vsebino e-pošte / ponudbe:
              </label>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Prilepi besedilo ponudbe ali e-pošte sem..."
                rows={10}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y font-mono"
              />
              <button
                onClick={() => pasteText.trim() && parseText(pasteText, "prilepljeno besedilo")}
                disabled={!pasteText.trim() || parsing}
                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {parsing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {parsing ? "AI razčlenjuje..." : "Razčleni z AI"}
              </button>
            </div>

            {parseError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                {parseError}
              </div>
            )}
            {savedOk && (
              <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <CheckCircle2 className="w-4 h-4" />
                Ponudba shranjena! Oglejte si zavihek Primerjava.
              </div>
            )}
          </div>

          {/* Right: parsed result + review */}
          <div>
            {parsing && (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin" />
                <p className="text-sm">AI razčlenjuje ponudbo...</p>
              </div>
            )}

            {parseResult && !parsing && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Razčlenjeno: <span className="text-primary">{parseResult.source}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{editedLines.length} vrstic najdenih — preverite in shranite</p>
                  </div>
                  <button onClick={handleSave} disabled={saving || editedLines.length === 0}
                    className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                    {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Shrani
                  </button>
                </div>

                <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                  {editedLines.map((line, i) => (
                    <div key={i} className="border border-border rounded-lg p-3 bg-white text-xs space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Dobavitelj</label>
                          <input value={line.vendor_name} onChange={e => updateLine(i, "vendor_name", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Šifra artikla</label>
                          <input value={line.item_no} onChange={e => updateLine(i, "item_no", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs font-mono bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                      </div>
                      <div>
                        <label className="text-muted-foreground block mb-0.5">Opis materiala</label>
                        <input value={line.item_description} onChange={e => updateLine(i, "item_description", e.target.value)}
                          className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Cena / enota</label>
                          <input type="number" value={line.price ?? ""} onChange={e => updateLine(i, "price", e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Valuta</label>
                          <input value={line.currency} onChange={e => updateLine(i, "currency", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Enota mere</label>
                          <input value={line.uom} onChange={e => updateLine(i, "uom", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Dobavni rok (dni)</label>
                          <input type="number" value={line.delivery_days ?? ""} onChange={e => updateLine(i, "delivery_days", e.target.value ? parseInt(e.target.value) : null)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Veljavno do</label>
                          <input value={line.valid_until} onChange={e => updateLine(i, "valid_until", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                        <div>
                          <label className="text-muted-foreground block mb-0.5">Opombe</label>
                          <input value={line.notes} onChange={e => updateLine(i, "notes", e.target.value)}
                            className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                        </div>
                      </div>
                      <button onClick={() => setEditedLines(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1">
                        <Trash2 className="w-3 h-3" /> Odstrani vrstico
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!parseResult && !parsing && (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <FileText className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Naloži datoteko ali prilepi besedilo ponudbe</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COMPARISON TAB ── */}
      {tab === "comparison" && (
        <div>
          {loadingQuotes && (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Nalagam...
            </div>
          )}

          {!loadingQuotes && comparison.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Inbox className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Ni shranjenih ponudb</p>
              <p className="text-xs mt-1">Dodajte ponudbe v zavihku "Novi vnos"</p>
            </div>
          )}

          {!loadingQuotes && comparison.length > 0 && (
            <div className="space-y-3">
              {comparison.map((group) => {
                const isExpanded = expandedGroups.has(group.canonical_item_no);
                const bestQuote = group.quotes.find(q => q.is_best_price);
                const hasMultipleVendors = new Set(group.quotes.map(q => q.vendorName)).size > 1;

                return (
                  <div key={group.canonical_item_no}
                    className={`border rounded-xl overflow-hidden ${
                      group.has_substitutes && hasMultipleVendors
                        ? "border-amber-300 shadow-sm"
                        : "border-border"
                    }`}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.canonical_item_no)}
                      className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                        group.has_substitutes && hasMultipleVendors
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "bg-muted/30 hover:bg-muted/60"
                      }`}>
                      <div className="flex items-center gap-3">
                        {group.has_substitutes && hasMultipleVendors && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-200 text-amber-800">
                            <Star className="w-2.5 h-2.5" /> Nadomestki
                          </span>
                        )}
                        <span className="font-mono text-sm font-semibold text-foreground">
                          {group.canonical_item_no}
                        </span>
                        {group.substitute_item_nos.length > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            + nadomestki: {group.substitute_item_nos.join(", ")}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">{group.quotes.length} ponudb</span>
                        {bestQuote && (
                          <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            Najboljša: {fmtPrice(bestQuote.price, bestQuote.currency)} — {bestQuote.vendorName}
                          </span>
                        )}
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>

                    {/* Quotes table */}
                    {isExpanded && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-t border-border bg-muted/20">
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Dobavitelj</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Šifra artikla</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Opis</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Cena / enota</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Enota</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Rok (dni)</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Veljavno do</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Opombe</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Vir</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.quotes.map((q, i) => (
                              <tr key={q.id}
                                className={`border-t border-border ${
                                  q.is_best_price
                                    ? "bg-green-50"
                                    : i % 2 === 0 ? "bg-white" : "bg-muted/10"
                                }`}>
                                <td className="px-3 py-2 font-medium">
                                  <div className="flex items-center gap-1">
                                    {q.is_best_price && <Star className="w-3 h-3 text-green-600 fill-green-500 shrink-0" />}
                                    {q.vendorName}
                                  </div>
                                </td>
                                <td className="px-3 py-2 font-mono text-muted-foreground">{q.itemNo || "—"}</td>
                                <td className="px-3 py-2 max-w-[200px] truncate" title={q.itemDescription}>{q.itemDescription || "—"}</td>
                                <td className={`px-3 py-2 text-right font-semibold ${q.is_best_price ? "text-green-700" : "text-foreground"}`}>
                                  {fmtPrice(q.price, q.currency)}
                                </td>
                                <td className="px-3 py-2 text-center text-muted-foreground">{q.uom || "—"}</td>
                                <td className="px-3 py-2 text-center">{q.deliveryDays ?? "—"}</td>
                                <td className="px-3 py-2 text-center">{fmtDate(q.validUntil)}</td>
                                <td className="px-3 py-2 text-muted-foreground max-w-[150px] truncate" title={q.notes}>{q.notes || "—"}</td>
                                <td className="px-3 py-2 text-muted-foreground text-[10px]">{q.sourceFile || "—"}</td>
                                <td className="px-3 py-2">
                                  <button onClick={() => handleDelete(q.id)}
                                    className="text-muted-foreground hover:text-red-500 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
