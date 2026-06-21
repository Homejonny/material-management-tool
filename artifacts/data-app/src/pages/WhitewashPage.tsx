import { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, RefreshCw,
  Send, Star, Package, X, Check, AlertTriangle, CheckCircle2,
  Building2, Mail, FileText
} from "lucide-react";

type Supplier = {
  id: number;
  genericMaterialId: number;
  vendorNo: string;
  vendorName: string;
  vendorEmail: string;
  vendorCountry: string;
  vendorItemNo: string;
  vendorItemName: string;
  notes: string;
};

type GenericMaterial = {
  id: number;
  genericCode: string;
  name: string;
  uom: string;
  notes: string;
  suppliers: Supplier[];
};

type Offer = {
  id: number;
  rfqId: number;
  vendorNo: string;
  vendorName: string;
  unitPrice: number | null;
  currency: string;
  deliveryDays: number | null;
  moq: number | null;
  validUntil: string;
  notes: string;
  receivedAt: string;
};

type RfqRecipient = {
  id: number;
  rfqId: number;
  vendorNo: string;
  vendorName: string;
  vendorEmail: string;
  vendorItemNo: string;
  vendorItemName: string;
  vendorCountry: string;
  status: string;
};

type Rfq = {
  id: number;
  genericMaterialId: number;
  quantity: number;
  uom: string;
  requestedDate: string;
  notes: string;
  sentAt: string | null;
  createdAt: string;
  material: GenericMaterial | null;
  recipients: RfqRecipient[];
  offers: Offer[];
};

type WTab = "materials" | "rfqs";

function fmtDate(iso: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("sl-SI"); } catch { return iso; }
}

function fmtPrice(v: number | null, cur: string) {
  if (v == null) return "—";
  return `${v.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${cur}`;
}

const EMPTY_MATERIAL = { genericCode: "", name: "", uom: "KG", notes: "" };
const EMPTY_SUPPLIER = { vendorNo: "", vendorName: "", vendorEmail: "", vendorCountry: "", vendorItemNo: "", vendorItemName: "", notes: "" };

// ─── Generic Materials Tab ────────────────────────────────────────────────────

function MaterialsTab() {
  const [materials, setMaterials] = useState<GenericMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editingMat, setEditingMat] = useState<Partial<GenericMaterial> | null>(null);
  const [editingMatId, setEditingMatId] = useState<number | null>(null);
  const [editingSup, setEditingSup] = useState<Partial<Supplier> | null>(null);
  const [editingSupId, setEditingSupId] = useState<number | null>(null);
  const [editingSupMatId, setEditingSupMatId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/generic-materials").then(r => r.json()).then(setMaterials).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function saveMaterial() {
    if (!editingMat?.name || !editingMat?.genericCode) return;
    setSaving(true); setError(null);
    try {
      const url = editingMatId ? `/api/generic-materials/${editingMatId}` : "/api/generic-materials";
      const method = editingMatId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingMat) });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingMat(null); setEditingMatId(null); load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  async function deleteMaterial(id: number) {
    if (!confirm("Brisanje generične kode in vseh povezav. Nadaljuješ?")) return;
    await fetch(`/api/generic-materials/${id}`, { method: "DELETE" });
    load();
  }

  async function saveSupplier() {
    if (!editingSup?.vendorName || editingSupMatId == null) return;
    setSaving(true); setError(null);
    try {
      const url = editingSupId
        ? `/api/generic-materials/${editingSupMatId}/suppliers/${editingSupId}`
        : `/api/generic-materials/${editingSupMatId}/suppliers`;
      const method = editingSupId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editingSup) });
      if (!res.ok) throw new Error((await res.json()).error);
      setEditingSup(null); setEditingSupId(null); setEditingSupMatId(null); load();
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  async function deleteSupplier(matId: number, sid: number) {
    await fetch(`/api/generic-materials/${matId}/suppliers/${sid}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Generična koda poveže isti material pri različnih dobaviteljih pod eno skupino.</p>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Osveži
          </button>
          <button onClick={() => { setEditingMat(EMPTY_MATERIAL); setEditingMatId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> Nova koda
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {/* Material edit modal */}
      {editingMat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="font-semibold text-foreground mb-4">{editingMatId ? "Uredi generično kodo" : "Nova generična koda"}</h3>
            <div className="space-y-3">
              <div><label className="text-xs text-muted-foreground block mb-1">Koda *</label>
                <input value={editingMat.genericCode ?? ""} onChange={e => setEditingMat(p => ({ ...p, genericCode: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="npr. GM-001" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Naziv *</label>
                <input value={editingMat.name ?? ""} onChange={e => setEditingMat(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Enota mere</label>
                <input value={editingMat.uom ?? "KG"} onChange={e => setEditingMat(p => ({ ...p, uom: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
              <div><label className="text-xs text-muted-foreground block mb-1">Opombe</label>
                <textarea value={editingMat.notes ?? ""} onChange={e => setEditingMat(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveMaterial} disabled={saving || !editingMat.name || !editingMat.genericCode}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Shrani
              </button>
              <button onClick={() => { setEditingMat(null); setEditingMatId(null); }} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier edit modal */}
      {editingSup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border shadow-xl p-6 w-full max-w-lg mx-4">
            <h3 className="font-semibold text-foreground mb-4">{editingSupId ? "Uredi dobavitelja" : "Dodaj dobavitelja"}</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["Naziv dobavitelja *", "vendorName", "text"],
                ["E-pošta", "vendorEmail", "email"],
                ["Šifra dobavitelja (BC)", "vendorNo", "text"],
                ["Država (SI / DE / …)", "vendorCountry", "text"],
                ["Šifra artikla pri dobavitelju", "vendorItemNo", "text"],
                ["Naziv artikla pri dobavitelju", "vendorItemName", "text"],
              ] as [string, keyof Supplier, string][]).map(([label, key, type]) => (
                <div key={key} className={key === "vendorName" || key === "vendorItemName" ? "col-span-2" : ""}>
                  <label className="text-xs text-muted-foreground block mb-1">{label}</label>
                  <input type={type} value={(editingSup as Record<string, string>)[key] ?? ""}
                    onChange={e => setEditingSup(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              ))}
              <div className="col-span-2"><label className="text-xs text-muted-foreground block mb-1">Opombe</label>
                <input value={editingSup.notes ?? ""} onChange={e => setEditingSup(p => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveSupplier} disabled={saving || !editingSup.vendorName}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Shrani
              </button>
              <button onClick={() => { setEditingSup(null); setEditingSupId(null); setEditingSupMatId(null); }} className="px-4 py-2 border border-border rounded-md text-sm hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {loading && !materials.length && (
        <div className="flex items-center justify-center h-32 text-muted-foreground"><RefreshCw className="w-5 h-5 animate-spin mr-2" /> Nalagam...</div>
      )}

      {!loading && !materials.length && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <Package className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Ni generičnih kod</p>
          <p className="text-xs mt-1">Ustvari prvo generično kodo z gumbom zgoraj</p>
        </div>
      )}

      <div className="space-y-2">
        {materials.map(m => {
          const isOpen = expanded.has(m.id);
          return (
            <div key={m.id} className="border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                <button onClick={() => toggleExpand(m.id)} className="flex items-center gap-3 flex-1 text-left">
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">{m.genericCode}</span>
                  <span className="font-semibold text-sm text-foreground">{m.name}</span>
                  <span className="text-xs text-muted-foreground">{m.uom}</span>
                  <span className="text-xs text-muted-foreground">{m.suppliers.length} {m.suppliers.length === 1 ? "dobavitelj" : "dobaviteljev"}</span>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => { setEditingMat({ genericCode: m.genericCode, name: m.name, uom: m.uom, notes: m.notes }); setEditingMatId(m.id); }}
                    className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => deleteMaterial(m.id)}
                    className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border">
                  {m.notes && <p className="px-4 py-2 text-xs text-muted-foreground italic">{m.notes}</p>}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dobavitelji</span>
                      <button onClick={() => { setEditingSup(EMPTY_SUPPLIER); setEditingSupId(null); setEditingSupMatId(m.id); }}
                        className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="w-3 h-3" /> Dodaj dobavitelja
                      </button>
                    </div>
                    {m.suppliers.length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-2">Ni dodanih dobaviteljev</p>
                    )}
                    <div className="space-y-1.5">
                      {m.suppliers.map(s => (
                        <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 text-xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="font-medium text-foreground truncate">{s.vendorName}</span>
                            {s.vendorItemNo && <span className="font-mono text-muted-foreground bg-background border border-border px-1.5 py-0.5 rounded shrink-0">{s.vendorItemNo}</span>}
                            {s.vendorItemName && <span className="text-muted-foreground truncate">{s.vendorItemName}</span>}
                            {s.vendorEmail && <span className="flex items-center gap-1 text-muted-foreground shrink-0"><Mail className="w-3 h-3" />{s.vendorEmail}</span>}
                          </div>
                          <div className="flex gap-1 ml-2 shrink-0">
                            <button onClick={() => { setEditingSup({ ...s }); setEditingSupId(s.id); setEditingSupMatId(m.id); }}
                              className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><Pencil className="w-3 h-3" /></button>
                            <button onClick={() => deleteSupplier(m.id, s.id)}
                              className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RFQ Tab ──────────────────────────────────────────────────────────────────

function RfqTab() {
  const [rfqs, setRfqs] = useState<Rfq[]>([]);
  const [materials, setMaterials] = useState<GenericMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New RFQ form state
  const [newMatId, setNewMatId] = useState<number | "">("");
  const [newQty, setNewQty] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<number>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendEmails, setSendEmails] = useState(true);

  // Offer form state
  const [addingOfferRfqId, setAddingOfferRfqId] = useState<number | null>(null);
  const [editingOffer, setEditingOffer] = useState<Partial<Offer> | null>(null);
  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);
  const [savingOffer, setSavingOffer] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/rfqs").then(r => r.json()),
      fetch("/api/generic-materials").then(r => r.json()),
    ]).then(([r, m]) => { setRfqs(r); setMaterials(m); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedMaterial = materials.find(m => m.id === newMatId);

  function toggleSupplier(id: number) {
    setSelectedSuppliers(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleExpand(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function sendRfq() {
    if (!newMatId || !newQty || !selectedMaterial || selectedSuppliers.size === 0) return;
    setSending(true); setError(null);
    try {
      const recipients = selectedMaterial.suppliers
        .filter(s => selectedSuppliers.has(s.id))
        .map(s => ({
          vendorNo: s.vendorNo,
          vendorName: s.vendorName,
          vendorEmail: s.vendorEmail,
          vendorItemNo: s.vendorItemNo,
          vendorItemName: s.vendorItemName,
          vendorCountry: s.vendorCountry,
        }));
      const res = await fetch("/api/rfqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          genericMaterialId: newMatId,
          quantity: parseFloat(newQty),
          uom: selectedMaterial.uom,
          requestedDate: newDate,
          notes: newNotes,
          recipients,
          sendEmails,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(sendEmails
        ? `Povpraševanje poslano ${recipients.length} dobaviteljem${data.emailErrors?.length ? ` (napake: ${data.emailErrors.join(", ")})` : ""}!`
        : "Povpraševanje shranjeno (e-pošte niso bile poslane).");
      setShowNew(false);
      setNewMatId(""); setNewQty(""); setNewDate(""); setNewNotes("");
      setSelectedSuppliers(new Set());
      load();
      setTimeout(() => setSuccess(null), 6000);
    } catch (e) { setError(String(e)); }
    finally { setSending(false); }
  }

  async function deleteRfq(id: number) {
    if (!confirm("Brišem povpraševanje in vse ponudbe. Nadaljuješ?")) return;
    await fetch(`/api/rfqs/${id}`, { method: "DELETE" });
    load();
  }

  async function saveOffer(rfqId: number) {
    if (!editingOffer?.vendorName) return;
    setSavingOffer(true);
    try {
      const url = editingOfferId ? `/api/rfqs/${rfqId}/offers/${editingOfferId}` : `/api/rfqs/${rfqId}/offers`;
      const method = editingOfferId ? "PUT" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingOffer),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setAddingOfferRfqId(null); setEditingOffer(null); setEditingOfferId(null);
      load();
    } catch (e) { setError(String(e)); }
    finally { setSavingOffer(false); }
  }

  async function deleteOffer(rfqId: number, oid: number) {
    await fetch(`/api/rfqs/${rfqId}/offers/${oid}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Pošlji primerjalno povpraševanje za isti material več dobaviteljem hkrati.</p>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Osveži
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
            <Send className="w-3.5 h-3.5" /> Novo povpraševanje
          </button>
        </div>
      </div>

      {error && <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertTriangle className="w-4 h-4" />{error}</div>}
      {success && <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700"><CheckCircle2 className="w-4 h-4" />{success}</div>}

      {/* New RFQ panel */}
      {showNew && (
        <div className="border border-primary/30 rounded-xl bg-primary/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Novo primerjalno povpraševanje</h3>
            <button onClick={() => { setShowNew(false); setError(null); }} className="p-1 hover:bg-muted rounded"><X className="w-4 h-4" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Material *</label>
              <select value={newMatId} onChange={e => { setNewMatId(e.target.value ? parseInt(e.target.value) : ""); setSelectedSuppliers(new Set()); }}
                className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">— izberi material —</option>
                {materials.map(m => <option key={m.id} value={m.id}>{m.genericCode} — {m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Količina *</label>
              <input type="number" value={newQty} onChange={e => setNewQty(e.target.value)} placeholder="npr. 100"
                className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Želen datum dobave</label>
              <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Opombe (neobvezno)</label>
            <input value={newNotes} onChange={e => setNewNotes(e.target.value)}
              className="w-full border border-border rounded px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Posebni pogoji, certifikati, …" />
          </div>

          {selectedMaterial && (
            <div className="mb-4">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-2">
                Izberi dobavitelje ({selectedSuppliers.size} izbranih)
              </label>
              {selectedMaterial.suppliers.length === 0 && (
                <p className="text-sm text-muted-foreground italic">Ta material nima dodanih dobaviteljev. Najprej jih dodaj v zavihku "Generične kode".</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedMaterial.suppliers.map(s => {
                  const sel = selectedSuppliers.has(s.id);
                  return (
                    <button key={s.id} onClick={() => toggleSupplier(s.id)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${sel ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/30"}`}>
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${sel ? "bg-primary border-primary" : "border-muted-foreground"}`}>
                        {sel && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{s.vendorName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                          {s.vendorItemNo && <span className="font-mono">{s.vendorItemNo}</span>}
                          {s.vendorItemName && <span className="truncate">{s.vendorItemName}</span>}
                        </div>
                        {s.vendorEmail && <div className="text-xs text-muted-foreground mt-0.5">{s.vendorEmail}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} className="rounded" />
              Pošlji e-pošto dobaviteljem
            </label>
            <button onClick={sendRfq} disabled={sending || !newMatId || !newQty || selectedSuppliers.size === 0}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? "Pošiljam…" : sendEmails ? "Pošlji povpraševanje" : "Shrani brez e-pošte"}
            </button>
          </div>
        </div>
      )}

      {!loading && rfqs.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
          <FileText className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm font-medium">Ni povpraševanj</p>
          <p className="text-xs mt-1">Ustvari prvo povpraševanje z gumbom zgoraj</p>
        </div>
      )}

      <div className="space-y-3">
        {rfqs.map(rfq => {
          const isOpen = expanded.has(rfq.id);
          const bestOffer = rfq.offers.length > 0
            ? rfq.offers.reduce((best, o) => (o.unitPrice != null && (best.unitPrice == null || o.unitPrice < best.unitPrice)) ? o : best, rfq.offers[0])
            : null;

          return (
            <div key={rfq.id} className="border border-border rounded-xl overflow-hidden">
              {/* RFQ header */}
              <div className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/40 transition-colors">
                <button onClick={() => toggleExpand(rfq.id)} className="flex items-center gap-3 flex-1 text-left min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground truncate">{rfq.material?.name ?? "—"}</span>
                      <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">{rfq.material?.genericCode}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{rfq.quantity} {rfq.uom}</span>
                      <span>·</span>
                      <span>{rfq.recipients.length} dobaviteljev</span>
                      <span>·</span>
                      <span>{rfq.offers.length} ponudb</span>
                      {rfq.sentAt && <><span>·</span><span>Poslano {fmtDate(rfq.sentAt)}</span></>}
                      {bestOffer?.unitPrice != null && (
                        <span className="text-green-700 font-medium flex items-center gap-1">
                          <Star className="w-3 h-3 fill-green-500" />
                          Najugodnejša: {fmtPrice(bestOffer.unitPrice, bestOffer.currency)} — {bestOffer.vendorName}
                        </span>
                      )}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />}
                </button>
                <button onClick={() => deleteRfq(rfq.id)} className="ml-2 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {isOpen && (
                <div className="border-t border-border">
                  {/* Recipients */}
                  <div className="px-4 py-3 border-b border-border/50">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Prejemniki povpraševanja</p>
                    <div className="flex flex-wrap gap-2">
                      {rfq.recipients.map(r => (
                        <div key={r.id} className="flex items-center gap-1.5 text-xs bg-muted px-2.5 py-1 rounded-full">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <span className="font-medium">{r.vendorName}</span>
                          {r.vendorItemNo && <span className="font-mono text-muted-foreground">({r.vendorItemNo})</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Offers comparison */}
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prejete ponudbe</p>
                      <button onClick={() => {
                        setAddingOfferRfqId(rfq.id);
                        setEditingOffer({ vendorName: "", currency: "EUR" });
                        setEditingOfferId(null);
                      }} className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="w-3 h-3" /> Vnesi ponudbo
                      </button>
                    </div>

                    {addingOfferRfqId === rfq.id && editingOffer && (
                      <div className="mb-3 p-3 border border-primary/30 rounded-lg bg-primary/5">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                          <div className="col-span-2">
                            <label className="text-xs text-muted-foreground block mb-0.5">Dobavitelj *</label>
                            <select value={editingOffer.vendorName ?? ""}
                              onChange={e => setEditingOffer(p => ({ ...p, vendorName: e.target.value }))}
                              className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30">
                              <option value="">— izberi —</option>
                              {rfq.recipients.map(r => <option key={r.id} value={r.vendorName}>{r.vendorName}</option>)}
                            </select>
                          </div>
                          {([
                            ["Cena/EM", "unitPrice", "number"],
                            ["Valuta", "currency", "text"],
                            ["Dobavni rok (dni)", "deliveryDays", "number"],
                            ["MOQ", "moq", "number"],
                            ["Veljavno do", "validUntil", "date"],
                            ["Opombe", "notes", "text"],
                          ] as [string, keyof Offer, string][]).map(([label, key, type]) => (
                            <div key={key} className={key === "notes" ? "col-span-2" : ""}>
                              <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
                              <input type={type} value={(editingOffer as Record<string, string | number>)[key] ?? ""}
                                onChange={e => setEditingOffer(p => ({
                                  ...p,
                                  [key]: (type === "number" && e.target.value) ? parseFloat(e.target.value) : e.target.value || (type === "number" ? null : ""),
                                }))}
                                className="w-full border border-border rounded px-2 py-1 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary/30" />
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveOffer(rfq.id)} disabled={savingOffer || !editingOffer.vendorName}
                            className="flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                            {savingOffer ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Shrani
                          </button>
                          <button onClick={() => { setAddingOfferRfqId(null); setEditingOffer(null); setEditingOfferId(null); }}
                            className="px-3 py-1 border border-border rounded text-xs hover:bg-muted"><X className="w-3 h-3" /></button>
                        </div>
                      </div>
                    )}

                    {rfq.offers.length === 0 && addingOfferRfqId !== rfq.id && (
                      <p className="text-xs text-muted-foreground italic">Ni vnesenih ponudb. Klikni "Vnesi ponudbo" ko prejmete odgovore dobaviteljev.</p>
                    )}

                    {rfq.offers.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-muted/30">
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Dobavitelj</th>
                              <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Cena/EM</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Valuta</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Rok (dni)</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">MOQ</th>
                              <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Veljavno do</th>
                              <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Opombe</th>
                              <th className="px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {rfq.offers.map((o, i) => {
                              const isBest = bestOffer?.id === o.id && o.unitPrice != null;
                              return (
                                <tr key={o.id} className={`border-t border-border ${isBest ? "bg-green-50" : i % 2 === 0 ? "bg-white" : "bg-muted/10"}`}>
                                  <td className="px-3 py-2 font-medium">
                                    <div className="flex items-center gap-1">
                                      {isBest && <Star className="w-3 h-3 text-green-600 fill-green-500 shrink-0" />}
                                      {o.vendorName}
                                    </div>
                                  </td>
                                  <td className={`px-3 py-2 text-right font-semibold ${isBest ? "text-green-700" : ""}`}>
                                    {o.unitPrice != null ? o.unitPrice.toLocaleString("sl-SI", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-center text-muted-foreground">{o.currency}</td>
                                  <td className="px-3 py-2 text-center">{o.deliveryDays ?? "—"}</td>
                                  <td className="px-3 py-2 text-center">{o.moq ?? "—"}</td>
                                  <td className="px-3 py-2 text-center">{fmtDate(o.validUntil)}</td>
                                  <td className="px-3 py-2 text-muted-foreground max-w-[180px] truncate" title={o.notes}>{o.notes || "—"}</td>
                                  <td className="px-3 py-2">
                                    <div className="flex gap-1">
                                      <button onClick={() => { setAddingOfferRfqId(rfq.id); setEditingOffer({ ...o }); setEditingOfferId(o.id); }}
                                        className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"><Pencil className="w-3 h-3" /></button>
                                      <button onClick={() => deleteOffer(rfq.id, o.id)}
                                        className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WhitewashPage() {
  const [tab, setTab] = useState<WTab>("materials");

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Primerjalno povpraševanje</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Poveži isti material pri različnih dobaviteljih in pošlji primerjalna povpraševanja
        </p>
      </div>

      <div className="flex gap-1 mb-6 bg-muted/40 p-1 rounded-lg w-fit">
        {([
          { id: "materials" as WTab, label: "Generične kode", icon: <Package className="w-3.5 h-3.5" /> },
          { id: "rfqs" as WTab, label: "Povpraševanja (RFQ)", icon: <Send className="w-3.5 h-3.5" /> },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === "materials" && <MaterialsTab />}
      {tab === "rfqs" && <RfqTab />}
    </div>
  );
}
