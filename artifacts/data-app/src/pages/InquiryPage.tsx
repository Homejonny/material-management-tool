import { useState, useMemo, useEffect } from "react";
import { Search, Printer, Mail, Building2, ChevronRight, RefreshCw, FileText, User, Phone, CheckSquare, Square, Send, CheckCircle2, AlertCircle } from "lucide-react";

type InquiryItem = {
  st: string;
  opis: string;
  uom: string;
  order_qty: number;
  vendor_item_no: string;
  receipt_date: string;
  order_date: string;
};

type VendorGroup = {
  vendor_no: string;
  vendor_name: string;
  vendor_name_2: string;
  vendor_address: string;
  vendor_post_code: string;
  vendor_city: string;
  vendor_country: string;
  vendor_phone: string;
  vendor_contact: string;
  item_count: number;
  items: InquiryItem[];
};

type ItemEdit = {
  qty: number;
  date: string;
  selected: boolean;
};

const SENDER = {
  name: "GMP Pharma d.o.o.",
  address: "Obrtna cona Logatec 10",
  city: "1370 Logatec",
  country: "Slovenija",
  email1: "info@gmp-pharma.eu",
  email2: "janez@gmp-pharma.eu",
};

function fmtDate(iso: string) {
  if (!iso || iso === "—") return "—";
  try {
    return new Date(iso).toLocaleDateString("sl-SI", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

function todayFmt() {
  return new Date().toLocaleDateString("sl-SI", { day: "2-digit", month: "long", year: "numeric" });
}

function isEnglish(country: string) {
  return country !== "" && country !== "SI";
}

const T = {
  sl: {
    dateLabel: "Datum",
    contactPrefix: "g./ga.",
    subject: "Zadeva: Povpraševanje za dobavo materialov",
    greeting: "Spoštovani,",
    body: "v skladu z našimi trenutnimi potrebami za proizvodnjo vas prosimo za potrditev razpoložljivosti in cen za spodaj navedene materiale. Prosimo za ponudbo s cenami in predvidenim datumom dobave.",
    colCode: "Šifra",
    colDesc: "Opis materiala",
    colQty: "Količina",
    colUnit: "Enota",
    colVendorRef: "Šifra dob.",
    colDate: "Žel. datum",
    closing: "Prosimo vas, da nam pošljete vašo ponudbo čim prej. Za morebitna vprašanja smo vam na voljo na zgornji kontaktni številki ali e-poštnem naslovu.",
    farewell: "Hvala za vaše hitro odzivanje in lep pozdrav,",
    dept: "Sektor nabave",
  },
  en: {
    dateLabel: "Date",
    contactPrefix: "Attn:",
    subject: "Subject: Request for Quotation — Raw Materials",
    greeting: "Dear Sir/Madam,",
    body: "In accordance with our current production requirements, we kindly request your confirmation of availability and pricing for the materials listed below. Please provide a quotation including unit prices and estimated delivery dates.",
    colCode: "Item No.",
    colDesc: "Material Description",
    colQty: "Quantity",
    colUnit: "Unit",
    colVendorRef: "Vendor Ref.",
    colDate: "Req. Date",
    closing: "Please send us your quotation at your earliest convenience. Should you have any questions, do not hesitate to contact us at the details above.",
    farewell: "Thank you for your prompt response. Kind regards,",
    dept: "Procurement Department",
  },
};

function InquiryLetter({
  vendor,
  vendorEmail,
  itemEdits,
  onToggle,
  onQtyChange,
  onDateChange,
}: {
  vendor: VendorGroup;
  vendorEmail: string;
  itemEdits: Record<string, ItemEdit>;
  onToggle: (st: string) => void;
  onQtyChange: (st: string, val: number) => void;
  onDateChange: (st: string, val: string) => void;
}) {
  const eng = isEnglish(vendor.vendor_country);
  const t = eng ? T.en : T.sl;
  const addressLine = [vendor.vendor_post_code, vendor.vendor_city].filter(Boolean).join(" ");
  const numFmt = eng ? "en-GB" : "sl-SI";

  const sortedItems = [...vendor.items].sort((a, b) => {
    const dateA = itemEdits[a.st]?.date || a.receipt_date || "";
    const dateB = itemEdits[b.st]?.date || b.receipt_date || "";
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return a.st.localeCompare(b.st);
  });

  const selectedCount = sortedItems.filter(i => itemEdits[i.st]?.selected !== false).length;

  return (
    <div className="print-area bg-white rounded-lg border border-border shadow-sm p-10 max-w-3xl mx-auto font-sans text-sm text-gray-800">
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="text-lg font-bold text-gray-900">{SENDER.name}</div>
          <div className="text-gray-500 text-xs mt-1">{SENDER.address}, {SENDER.city}</div>
          <div className="text-gray-500 text-xs">{SENDER.country}</div>
          <div className="text-gray-500 text-xs mt-1">{SENDER.email1} · {SENDER.email2}</div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div className="font-semibold text-gray-700 mb-1">{t.dateLabel}</div>
          <div>{todayFmt()}</div>
        </div>
      </div>

      <div className="border-t border-gray-200 my-6" />

      <div className="mb-6">
        <div className="font-semibold text-gray-900">{vendor.vendor_name}</div>
        {vendor.vendor_name_2 && <div className="text-gray-600">{vendor.vendor_name_2}</div>}
        {vendor.vendor_contact && (
          <div className="text-gray-600">{t.contactPrefix} {vendor.vendor_contact}</div>
        )}
        {vendor.vendor_address && <div className="text-gray-600">{vendor.vendor_address}</div>}
        {addressLine && <div className="text-gray-600">{addressLine}</div>}
        {vendor.vendor_country && <div className="text-gray-600">{vendor.vendor_country}</div>}
        {vendorEmail && <div className="text-gray-500 text-xs mt-1">{vendorEmail}</div>}
        {vendor.vendor_phone && <div className="text-gray-500 text-xs">{vendor.vendor_phone}</div>}
      </div>

      <div className="mb-6">
        <div className="font-bold text-gray-900 text-base">{t.subject}</div>
      </div>

      <p className="text-gray-700 mb-2">{t.greeting}</p>
      <p className="text-gray-700 mb-6">{t.body}</p>

      {/* Selection summary bar — hidden during print */}
      <div className="no-print mb-3 flex items-center justify-between text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded px-3 py-1.5">
        <span>{selectedCount} / {sortedItems.length} vrstic izbranih za pošiljanje</span>
        <div className="flex gap-3">
          <button
            onClick={() => sortedItems.forEach(i => { if (itemEdits[i.st]?.selected === false) onToggle(i.st); })}
            className="text-primary hover:underline"
          >
            Izberi vse
          </button>
          <button
            onClick={() => sortedItems.forEach(i => { if (itemEdits[i.st]?.selected !== false) onToggle(i.st); })}
            className="text-gray-500 hover:underline"
          >
            Počisti vse
          </button>
        </div>
      </div>

      <table className="w-full border-collapse mb-6 text-xs">
        <thead>
          <tr className="bg-gray-100">
            {/* Checkbox column — hidden during print */}
            <th className="no-print border border-gray-300 px-2 py-2 w-8" />
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold w-20">{t.colCode}</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold">{t.colDesc}</th>
            <th className="border border-gray-300 px-3 py-2 text-right font-semibold w-28">{t.colQty}</th>
            <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-16">{t.colUnit}</th>
            <th className="border border-gray-300 px-3 py-2 text-left font-semibold w-28">{t.colVendorRef}</th>
            <th className="border border-gray-300 px-3 py-2 text-center font-semibold w-28">{t.colDate}</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item, i) => {
            const edit = itemEdits[item.st];
            const selected = edit?.selected !== false;
            const qty = edit?.qty ?? item.order_qty;
            const date = edit?.date ?? item.receipt_date;
            const rowClass = selected
              ? (i % 2 === 0 ? "bg-white" : "bg-gray-50")
              : "bg-gray-100 opacity-40 no-print";

            return (
              <tr key={item.st} className={rowClass}>
                {/* Checkbox — hidden during print */}
                <td className="no-print border border-gray-300 px-2 py-1.5 text-center">
                  <button
                    onClick={() => onToggle(item.st)}
                    className="text-primary hover:text-primary/80 transition-colors"
                    title={selected ? "Izključi iz pisma" : "Vključi v pismo"}
                  >
                    {selected
                      ? <CheckSquare className="w-4 h-4" />
                      : <Square className="w-4 h-4 text-gray-400" />
                    }
                  </button>
                </td>
                <td className="border border-gray-300 px-3 py-1.5 font-mono">{item.st}</td>
                <td className="border border-gray-300 px-3 py-1.5">{item.opis}</td>

                {/* Editable qty */}
                <td className="border border-gray-300 px-1.5 py-1 text-right">
                  <input
                    type="number"
                    value={qty}
                    min={0}
                    step="any"
                    onChange={e => onQtyChange(item.st, parseFloat(e.target.value) || 0)}
                    className="w-full text-right font-medium bg-transparent border-0 border-b border-blue-300 focus:border-blue-500 focus:outline-none px-1 py-0 print:border-0"
                    style={{ minWidth: 0 }}
                  />
                </td>

                <td className="border border-gray-300 px-3 py-1.5 text-center">{item.uom || "—"}</td>
                <td className="border border-gray-300 px-3 py-1.5 text-gray-500">{item.vendor_item_no || "—"}</td>

                {/* Editable date */}
                <td className="border border-gray-300 px-1.5 py-1 text-center">
                  <input
                    type="date"
                    value={date && date !== "—" && date > "0001-01-01" ? date.substring(0, 10) : ""}
                    onChange={e => onDateChange(item.st, e.target.value)}
                    className="w-full text-center bg-transparent border-0 border-b border-blue-300 focus:border-blue-500 focus:outline-none px-1 py-0 print:border-0 print:hidden"
                  />
                  {/* Print-only date display */}
                  <span className="hidden print:inline">
                    {date && date !== "—" && date > "0001-01-01" ? fmtDate(date) : "—"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-gray-700 mb-6">{t.closing}</p>
      <p className="text-gray-700 mb-8">{t.farewell}</p>

      <div className="border-t border-gray-200 pt-4">
        <div className="font-semibold text-gray-900">{SENDER.name}</div>
        <div className="text-gray-500 text-xs">{t.dept}</div>
      </div>
    </div>
  );
}

export default function InquiryPage() {
  const [vendors, setVendors] = useState<VendorGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVendorNo, setSelectedVendorNo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [vendorEmails, setVendorEmails] = useState<Record<string, string>>({});
  const [itemEdits, setItemEdits] = useState<Record<string, ItemEdit>>({});
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "ok" | "error">("idle");
  const [sendError, setSendError] = useState<string | null>(null);;

  const fetchData = () => {
    setLoading(true);
    setError(null);
    fetch("/api/orders/by-vendor")
      .then((r) => r.json())
      .then((data: VendorGroup[]) => {
        setVendors(data);
        setSelectedVendorNo(prev => prev ?? ((data.find(v => v.vendor_no) ?? data[0])?.vendor_no || "NONE"));
        setLoading(false);
      })
      .catch((e) => { setError(String(e)); setLoading(false); });
  };

  useEffect(() => { fetchData(); }, []);

  // Re-initialize edits when selected vendor changes
  useEffect(() => {
    if (!vendors || !selectedVendorNo) return;
    const vendor = vendors.find(v => (v.vendor_no || "NONE") === selectedVendorNo);
    if (!vendor) return;
    const init: Record<string, ItemEdit> = {};
    for (const item of vendor.items) {
      init[item.st] = { qty: item.order_qty, date: item.receipt_date, selected: true };
    }
    setItemEdits(init);
  }, [selectedVendorNo, vendors]);

  const handleToggle = (st: string) => {
    setItemEdits(prev => ({
      ...prev,
      [st]: { ...prev[st], selected: !(prev[st]?.selected !== false) },
    }));
  };

  const handleQtyChange = (st: string, val: number) => {
    setItemEdits(prev => ({ ...prev, [st]: { ...prev[st], qty: val } }));
  };

  const handleDateChange = (st: string, val: string) => {
    setItemEdits(prev => ({ ...prev, [st]: { ...prev[st], date: val } }));
  };

  const filtered = useMemo(() => {
    if (!vendors) return [];
    if (!search) return vendors;
    const q = search.toLowerCase();
    return vendors.filter(v =>
      v.vendor_name.toLowerCase().includes(q) ||
      v.vendor_no.includes(q) ||
      v.items.some(i => i.st.includes(q) || i.opis.toLowerCase().includes(q))
    );
  }, [vendors, search]);

  const selectedVendor = useMemo(() =>
    vendors?.find(v => (v.vendor_no || "NONE") === selectedVendorNo) ?? null,
    [vendors, selectedVendorNo]
  );

  const currentEmail = selectedVendorNo ? (vendorEmails[selectedVendorNo] ?? "") : "";

  // Reset send status when vendor or email changes
  useEffect(() => { setSendStatus("idle"); setSendError(null); }, [selectedVendorNo, currentEmail]);

  function handlePrint() {
    window.print();
  }

  async function handleSendEmail() {
    if (!selectedVendor || !currentEmail) return;
    const eng = isEnglish(selectedVendor.vendor_country);

    const selectedItems = selectedVendor.items
      .filter(i => itemEdits[i.st]?.selected !== false)
      .map(i => ({
        st: i.st,
        opis: i.opis,
        uom: i.uom,
        qty: itemEdits[i.st]?.qty ?? i.order_qty,
        date: itemEdits[i.st]?.date ?? i.receipt_date,
        vendor_item_no: i.vendor_item_no,
      }));

    if (selectedItems.length === 0) return;

    setSending(true);
    setSendStatus("idle");
    setSendError(null);

    try {
      const res = await fetch("/api/email/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: currentEmail,
          vendorName: selectedVendor.vendor_name,
          vendorName2: selectedVendor.vendor_name_2,
          vendorAddress: selectedVendor.vendor_address,
          vendorPostCode: selectedVendor.vendor_post_code,
          vendorCity: selectedVendor.vendor_city,
          vendorCountry: selectedVendor.vendor_country,
          vendorContact: selectedVendor.vendor_contact,
          vendorPhone: selectedVendor.vendor_phone,
          eng,
          items: selectedItems,
        }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setSendStatus("ok");
    } catch (e) {
      setSendStatus("error");
      setSendError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Nalagam podatke o dobaviteljih...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center text-red-500">
          <p className="font-semibold">Napaka pri nalaganju</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          /* Collapse the entire app so it takes up zero height — prevents extra blank pages */
          body > * {
            height: 0 !important;
            overflow: hidden !important;
            visibility: hidden !important;
          }
          /* Print area escapes via position: fixed (not clipped by parent overflow) */
          .print-area {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            height: auto !important;
            overflow: visible !important;
            visibility: visible !important;
            padding: 15mm 20mm !important;
            margin: 0 !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
          }
          .print-area * { visibility: visible !important; }
          .no-print { display: none !important; }
          tr.no-print { display: none !important; }
          input[type="number"] {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            -webkit-appearance: none;
            -moz-appearance: textfield;
          }
          input[type="number"]::-webkit-outer-spin-button,
          input[type="number"]::-webkit-inner-spin-button { display: none !important; }
          input[type="date"] { display: none !important; }
          .print\\:inline { display: inline !important; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>

      <div className="max-w-[1600px] mx-auto px-6 py-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Povpraševanje dobaviteljem</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Izberite dobavitelja, vrstice, uredite količine in datume, nato pošljite ali natisnite
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="print:hidden flex items-center gap-2 px-3 py-1.5 text-sm border border-border rounded-md bg-background hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Osveži
          </button>
        </div>

        <div className="flex gap-6 items-start">
          <aside className="w-72 flex-shrink-0 sticky top-20">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Išči dobavitelja ali material..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="text-xs text-muted-foreground mb-2 px-1">
              {filtered.length} dobaviteljev · {filtered.reduce((s, v) => s + v.item_count, 0)} materialov
            </div>
            <div className="space-y-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filtered.map(v => {
                const key = v.vendor_no || "NONE";
                const isSelected = key === selectedVendorNo;
                const isUnknown = !v.vendor_no;
                const email = vendorEmails[key] ?? "";
                return (
                  <button
                    key={key}
                    onClick={() => setSelectedVendorNo(key)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className={`font-medium truncate ${isUnknown ? "italic" : ""}`}>
                        {v.vendor_name}
                      </div>
                      <div className={`text-xs truncate ${isSelected ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                        {email || (v.vendor_phone ? v.vendor_phone : v.vendor_city || "ni kontakta")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {email && (
                        <Mail className={`w-3 h-3 ${isSelected ? "text-white" : "text-emerald-500"}`} />
                      )}
                      {isEnglish(v.vendor_country) && (
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${
                          isSelected ? "bg-white/20 text-white" : "bg-blue-100 text-blue-600"
                        }`} title="Tuj dobavitelj — dopis v angleščini">EN</span>
                      )}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                      }`}>
                        {v.item_count}
                      </span>
                      <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isSelected ? "text-white" : "text-muted-foreground"}`} />
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {selectedVendor ? (
              <>
                <div className="bg-muted/40 border border-border rounded-lg p-4 mb-4 flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">{selectedVendor.vendor_name}</div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {selectedVendor.vendor_contact && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {selectedVendor.vendor_contact}
                          </span>
                        )}
                        {selectedVendor.vendor_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {selectedVendor.vendor_phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          {Object.values(itemEdits).filter(e => e.selected !== false).length} / {selectedVendor.item_count} materialov izbranih
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 items-end">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input
                          type="email"
                          value={currentEmail}
                          onChange={e => setVendorEmails(prev => ({ ...prev, [selectedVendorNo!]: e.target.value }))}
                          placeholder="E-pošta dobavitelja..."
                          className="pl-8 pr-3 py-2 text-sm border border-border rounded-md bg-background w-56 focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <button
                        onClick={handleSendEmail}
                        disabled={!currentEmail || sending}
                        className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          sendStatus === "ok"
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : sendStatus === "error"
                              ? "bg-red-50 border border-red-300 text-red-700 hover:bg-red-100"
                              : "border border-border hover:bg-muted"
                        }`}
                        title={!currentEmail ? "Vnesite e-poštni naslov" : "Pošlji HTML e-pošto dobavitelju"}
                      >
                        {sending ? (
                          <><RefreshCw className="w-4 h-4 animate-spin" />Pošiljam...</>
                        ) : sendStatus === "ok" ? (
                          <><CheckCircle2 className="w-4 h-4" />Poslano</>
                        ) : sendStatus === "error" ? (
                          <><AlertCircle className="w-4 h-4" />Napaka</>
                        ) : (
                          <><Send className="w-4 h-4" />Pošlji</>
                        )}
                      </button>
                    </div>
                    {sendStatus === "ok" && (
                      <div className="text-xs text-emerald-600">E-pošta poslana na {currentEmail}</div>
                    )}
                    {sendStatus === "error" && sendError && (
                      <div className="text-xs text-red-600 max-w-xs text-right">{sendError}</div>
                    )}
                  </div>
                  <button
                    onClick={handlePrint}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors self-start"
                  >
                    <Printer className="w-4 h-4" />
                    Natisni / PDF
                  </button>
                </div>

                <InquiryLetter
                  vendor={selectedVendor}
                  vendorEmail={currentEmail}
                  itemEdits={itemEdits}
                  onToggle={handleToggle}
                  onQtyChange={handleQtyChange}
                  onDateChange={handleDateChange}
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Izberite dobavitelja na levi strani</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
