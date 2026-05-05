import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

type StaticMaterial = {
  st: string | number;
  opis: string;
  zaloga: number;
  cena: number;
  kolicina: number;
  totalSubStock: number;
  dejansko: number;
};

type BcItemPlanning = {
  No: string;
  Description: string;
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
  number: string; // item no
  vendorItemNumber: string;
  expectedReceiptDate: string;
};

export type OrderSuggestion = {
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

function parseLeadTimeDays(lt: string): number {
  if (!lt || lt.trim() === "") return 0;
  const match = lt.trim().match(/^(\d+)([DWMY])$/i);
  if (!match) return 0;
  const n = parseInt(match[1], 10);
  switch (match[2].toUpperCase()) {
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

function padArticleNo(st: string | number): string {
  return String(st).padStart(6, "0");
}

let staticMaterials: StaticMaterial[] | null = null;
function getStaticMaterials(): StaticMaterial[] {
  if (staticMaterials) return staticMaterials;
  const dataPath = join(__dirname, "../data/materials.json");
  staticMaterials = JSON.parse(readFileSync(dataPath, "utf-8"));
  return staticMaterials!;
}

const BASE_URL = process.env.BC_URL!;
function bcAuth(): string {
  return "Basic " + Buffer.from(`${process.env.BC_USERNAME}:${process.env.BC_PASSWORD}`).toString("base64");
}
const BC_HEADERS = { Authorization: bcAuth(), Accept: "application/json" };

async function paginatedFetch<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: BC_HEADERS });
    if (!res.ok) throw new Error(`BC error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { value: T[]; "@odata.nextLink"?: string };
    results.push(...json.value);
    next = json["@odata.nextLink"] ?? null;
  }
  return results;
}

async function fetchBcItemsPlanning(): Promise<Map<string, BcItemPlanning>> {
  const select = "No,Vendor_No,Vendor_Item_No,Lead_Time_Calculation,Replenishment_System,Description";
  const items = await paginatedFetch<BcItemPlanning>(`${BASE_URL}/Item?$select=${select}&$top=500`);
  return new Map(items.map((i) => [i.No.trim(), i]));
}

async function fetchVendors(): Promise<Map<string, BcVendor>> {
  const vendors = await paginatedFetch<BcVendor>(
    `${BASE_URL}/Dobavitelji?$select=No,Name,Lead_Time_Calculation&$top=500`
  );
  return new Map(vendors.map((v) => [v.No.trim(), v]));
}

// Build item → most recent purchase line map (vendor source of truth)
async function fetchRecentPurchaseVendors(): Promise<Map<string, PurchaseLine>> {
  const select = "documentNumber,buyFromVendorNumber,number,vendorItemNumber,expectedReceiptDate";
  const lines = await paginatedFetch<PurchaseLine>(
    `${BASE_URL}/purchaseDocumentLines?$select=${select}&$top=500`
  );

  // Per item, keep the line with the latest expectedReceiptDate
  const map = new Map<string, PurchaseLine>();
  for (const line of lines) {
    if (!line.number || !line.buyFromVendorNumber) continue;
    const key = line.number.trim();
    const existing = map.get(key);
    if (!existing || line.expectedReceiptDate > existing.expectedReceiptDate) {
      map.set(key, line);
    }
  }
  return map;
}

let ordersCache: { data: OrderSuggestion[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

async function getOrderSuggestions(log: (m: string) => void): Promise<OrderSuggestion[]> {
  if (ordersCache && Date.now() - ordersCache.fetchedAt < CACHE_TTL) return ordersCache.data;

  log("Fetching BC planning, vendor and purchase data...");
  const [itemsMap, vendorsMap, purchaseVendors] = await Promise.all([
    fetchBcItemsPlanning(),
    fetchVendors(),
    fetchRecentPurchaseVendors(),
  ]);
  log(`Loaded ${itemsMap.size} items, ${vendorsMap.size} vendors, ${purchaseVendors.size} purchase item-vendor mappings`);

  const statics = getStaticMaterials();
  const today = new Date();

  const suggestions: OrderSuggestion[] = statics
    .filter((m) => m.dejansko > 0)
    .map((m) => {
      const key = String(m.st).trim();
      const paddedKey = padArticleNo(m.st);
      const bcItem = itemsMap.get(key) ?? itemsMap.get(paddedKey);
      const purchaseLine = purchaseVendors.get(key) ?? purchaseVendors.get(paddedKey);

      // Vendor priority: 1. Item card Vendor_No, 2. Most recent purchase order
      const vendorNo = (bcItem?.Vendor_No?.trim() || purchaseLine?.buyFromVendorNumber?.trim() || "").trim();
      const vendor = vendorNo ? vendorsMap.get(vendorNo) : undefined;

      // Vendor item number: from item card first, then from purchase line
      const vendorItemNo =
        bcItem?.Vendor_Item_No?.trim() || purchaseLine?.vendorItemNumber?.trim() || "";

      // Lead time: from item card first, then from vendor card
      const rawLeadTime =
        bcItem?.Lead_Time_Calculation?.trim() ||
        vendor?.Lead_Time_Calculation?.trim() ||
        "";
      const leadTimeDays = parseLeadTimeDays(rawLeadTime);

      // Only use future expected receipt dates from open purchase orders
      const todayStr = today.toISOString().slice(0, 10);
      const futureReceiptDate =
        purchaseLine?.expectedReceiptDate && purchaseLine.expectedReceiptDate >= todayStr
          ? purchaseLine.expectedReceiptDate
          : null;

      return {
        st: paddedKey,
        opis: bcItem?.Description ?? m.opis,
        dejansko: m.dejansko,
        vendor_no: vendorNo,
        vendor_name: vendor?.Name ?? (vendorNo ? vendorNo : "Ni določen"),
        vendor_item_no: vendorItemNo,
        lead_time: rawLeadTime || "—",
        lead_time_days: leadTimeDays,
        order_date: addDays(today, 0),
        receipt_date: futureReceiptDate
          ? futureReceiptDate
          : leadTimeDays > 0
            ? addDays(today, leadTimeDays)
            : "—",
        replenishment_system: bcItem?.Replenishment_System ?? "",
      };
    })
    .sort((a, b) => a.st.localeCompare(b.st));

  ordersCache = { data: suggestions, fetchedAt: Date.now() };
  return suggestions;
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

export function invalidateOrdersCache() {
  ordersCache = null;
}

export default router;
