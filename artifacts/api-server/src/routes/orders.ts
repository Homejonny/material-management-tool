import { Router } from "express";
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getMaterialsWithLiveData } from "./materials.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

export type OrderSuggestion = {
  st: string;
  opis: string;
  dejansko: number;
  order_multiple: number;
  order_qty: number;
  vendor_no: string;
  vendor_name: string;
  vendor_item_no: string;
  lead_time: string;
  lead_time_days: number;
  order_date: string;
  receipt_date: string;
  replenishment_system: string;
};

type BcItemPlanning = {
  No: string;
  Vendor_No: string;
  Vendor_Item_No: string;
  Lead_Time_Calculation: string;
  Replenishment_System: string;
};

type BcVendor = {
  No: string;
  Name: string;
  Lead_Time_Calculation: string;
};

type PurchaseLine = {
  documentNumber: string;
  buyFromVendorNumber: string;
  number: string;
  vendorItemNumber: string;
  expectedReceiptDate: string;
};

type PlanningRow = {
  No: string;
  Quantity: number;
  Order_Date: string;
  Due_Date: string;
};

const BASE_URL = process.env.BC_URL!;
function bcAuth() {
  return "Basic " + Buffer.from(`${process.env.BC_USERNAME}:${process.env.BC_PASSWORD}`).toString("base64");
}
const BC_HDR = () => ({ Authorization: bcAuth(), Accept: "application/json" });

async function paginatedFetch<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: BC_HDR() });
    if (!res.ok) throw new Error(`BC ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { value: T[]; "@odata.nextLink"?: string };
    results.push(...json.value);
    next = json["@odata.nextLink"] ?? null;
  }
  return results;
}

function parseLeadTimeDays(lt: string): number {
  if (!lt?.trim()) return 0;
  const m = lt.trim().match(/^(\d+)([DWMY])$/i);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  switch (m[2].toUpperCase()) {
    case "D": return n;
    case "W": return n * 7;
    case "M": return n * 30;
    case "Y": return n * 365;
    default: return 0;
  }
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

let orderMultiplesMap: Record<string, number> | null = null;
function getOrderMultiples(): Record<string, number> {
  if (orderMultiplesMap) return orderMultiplesMap;
  const p = join(__dirname, "../data/order-multiples.json");
  orderMultiplesMap = JSON.parse(readFileSync(p, "utf-8"));
  return orderMultiplesMap!;
}

async function fetchItemVendorPlanning(): Promise<Map<string, BcItemPlanning>> {
  const rows = await paginatedFetch<BcItemPlanning>(
    `${BASE_URL}/Item?$select=No,Vendor_No,Vendor_Item_No,Lead_Time_Calculation,Replenishment_System&$top=500`
  );
  return new Map(rows.map((r) => [r.No.trim(), r]));
}

async function fetchVendors(): Promise<Map<string, BcVendor>> {
  const rows = await paginatedFetch<BcVendor>(
    `${BASE_URL}/Dobavitelji?$select=No,Name,Lead_Time_Calculation&$top=500`
  );
  return new Map(rows.map((v) => [v.No.trim(), v]));
}

async function fetchRecentPurchaseVendors(): Promise<Map<string, PurchaseLine>> {
  const lines = await paginatedFetch<PurchaseLine>(
    `${BASE_URL}/purchaseDocumentLines?$select=documentNumber,buyFromVendorNumber,number,vendorItemNumber,expectedReceiptDate&$top=500`
  );
  const map = new Map<string, PurchaseLine>();
  const today = new Date().toISOString().slice(0, 10);
  for (const line of lines) {
    const key = line.number?.trim();
    if (!key || !line.buyFromVendorNumber) continue;
    const existing = map.get(key);
    // Prefer future receipt dates; otherwise take latest
    const isFuture = line.expectedReceiptDate >= today;
    const existingIsFuture = existing ? existing.expectedReceiptDate >= today : false;
    if (!existing) {
      map.set(key, line);
    } else if (isFuture && !existingIsFuture) {
      map.set(key, line);
    } else if (isFuture && existingIsFuture && line.expectedReceiptDate > existing.expectedReceiptDate) {
      map.set(key, line);
    }
  }
  return map;
}

// Fetch planning worksheet dates per item (earliest order_date)
async function fetchPlanningDates(): Promise<Map<string, { orderDate: string; dueDate: string }>> {
  const rows = await paginatedFetch<PlanningRow>(
    `${BASE_URL}/PlanningWorksheet?$select=No,Quantity,Order_Date,Due_Date&$top=500`
  );
  const map = new Map<string, { orderDate: string; dueDate: string }>();
  for (const r of rows) {
    const key = r.No?.trim();
    if (!key || r.Quantity <= 0) continue;
    const existing = map.get(key);
    if (!existing || r.Order_Date < existing.orderDate) {
      map.set(key, { orderDate: r.Order_Date, dueDate: r.Due_Date });
    }
  }
  return map;
}

let ordersCache: { data: OrderSuggestion[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getOrderSuggestions(log: (m: string) => void): Promise<OrderSuggestion[]> {
  if (ordersCache && Date.now() - ordersCache.fetchedAt < CACHE_TTL) return ordersCache.data;

  log("Fetching BC vendor, purchase, and planning dates...");
  const [materials, itemVendorMap, vendorsMap, purchaseMap, planningDates] = await Promise.all([
    getMaterialsWithLiveData(log),
    fetchItemVendorPlanning(),
    fetchVendors(),
    fetchRecentPurchaseVendors(),
    fetchPlanningDates(),
  ]);
  log(`Loaded ${itemVendorMap.size} items, ${vendorsMap.size} vendors, ${purchaseMap.size} purchase lines`);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const orderMultiples = getOrderMultiples();

  const suggestions: OrderSuggestion[] = materials
    .filter((m) => m.dejansko > 0)
    .map((m) => {
      const key = m.st.trim();
      const bcItem = itemVendorMap.get(key);
      const purchaseLine = purchaseMap.get(key);

      const vendorNo = (bcItem?.Vendor_No?.trim() || purchaseLine?.buyFromVendorNumber?.trim() || "").trim();
      const vendor = vendorNo ? vendorsMap.get(vendorNo) : undefined;
      const vendorItemNo = bcItem?.Vendor_Item_No?.trim() || purchaseLine?.vendorItemNumber?.trim() || "";
      const rawLeadTime = bcItem?.Lead_Time_Calculation?.trim() || vendor?.Lead_Time_Calculation?.trim() || "";
      const leadTimeDays = parseLeadTimeDays(rawLeadTime);

      // Order multiple: from static config file (BC OData does not expose planning qty fields)
      const orderMultiple = orderMultiples[key] ?? 0;
      const orderQty = orderMultiple > 0
        ? Math.ceil(m.dejansko / orderMultiple) * orderMultiple
        : m.dejansko;

      // Use planning worksheet Order_Date as suggested order date
      const planDates = planningDates.get(key);
      const orderDate = planDates?.orderDate && planDates.orderDate > "0001-01-01"
        ? planDates.orderDate
        : todayStr;

      // Receipt date: future purchase order > planning due date > order date + lead time
      const futureReceipt = purchaseLine?.expectedReceiptDate && purchaseLine.expectedReceiptDate >= todayStr
        ? purchaseLine.expectedReceiptDate
        : null;
      const planDueDate = planDates?.dueDate && planDates.dueDate > "0001-01-01"
        ? planDates.dueDate
        : null;

      const receiptDate = futureReceipt
        ?? planDueDate
        ?? (leadTimeDays > 0 ? addDays(today, leadTimeDays) : "—");

      return {
        st: key,
        opis: m.opis,
        dejansko: m.dejansko,
        order_multiple: orderMultiple,
        order_qty: orderQty,
        vendor_no: vendorNo,
        vendor_name: vendor?.Name ?? (vendorNo ? vendorNo : "Ni določen"),
        vendor_item_no: vendorItemNo,
        lead_time: rawLeadTime || "—",
        lead_time_days: leadTimeDays,
        order_date: orderDate,
        receipt_date: receiptDate,
        replenishment_system: bcItem?.Replenishment_System ?? "",
      };
    })
    .sort((a, b) => a.st.localeCompare(b.st));

  ordersCache = { data: suggestions, fetchedAt: Date.now() };
  return suggestions;
}

export function invalidateOrdersCache() {
  ordersCache = null;
}

router.get("/orders", async (req, res) => {
  try {
    const data = await getOrderSuggestions((m) => req.log.info(m));
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to load order suggestions");
    res.status(500).json({ error: "Failed to load order suggestions" });
  }
});

// GET /orders/multiples — return current map
router.get("/orders/multiples", (_req, res) => {
  res.json(getOrderMultiples());
});

// PATCH /orders/multiples — update one or more multiples and invalidate cache
router.patch("/orders/multiples", (req, res) => {
  const updates = req.body as Record<string, number>;
  if (typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ error: "Body must be an object { itemNo: multiple }" });
    return;
  }
  const current = getOrderMultiples();
  const merged = { ...current };
  for (const [k, v] of Object.entries(updates)) {
    if (typeof v !== "number" || v < 0) continue;
    if (v === 0) {
      delete merged[k];
    } else {
      merged[k] = v;
    }
  }
  const p = join(__dirname, "../data/order-multiples.json");
  writeFileSync(p, JSON.stringify(merged, null, 2));
  orderMultiplesMap = merged;
  ordersCache = null; // invalidate so next fetch recalculates
  res.json({ ok: true, updated: Object.keys(updates).length });
});

export default router;
