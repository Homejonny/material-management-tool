import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const ACTIVE_STATUSES = new Set(["Načrtovano", "Potrjen", "Izdano", "Čvrsto načrtovano"]);

// UoM conversion: ProdOrderComponents.Remaining_Quantity is always in base KOS/CPS/KG.
// For items stored per 1000 units, divide RemQty by this factor to match Item.InventoryField units.
const UOM_FACTORS: Record<string, number> = {
  "1000CPS": 1000,
};

export type ScheduleLine = {
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

type BcItem = {
  No: string;
  Description: string;
  InventoryField: number;
  Unit_Cost: number;
  Base_Unit_of_Measure: string;
  Vendor_No: string;
  Lead_Time_Calculation: string;
};

type BcVendor = { No: string; Name: string; Lead_Time_Calculation: string };

type ProdComp = {
  Status: string;
  Prod_Order_No: string;
  Item_No: string;
  Description: string;
  Remaining_Quantity: number;
  Due_Date: string;
  Unit_Cost: number;
};

let subsMap: Record<string, string[]> | null = null;
function getSubstitutesMap(): Record<string, string[]> {
  if (subsMap) return subsMap;
  subsMap = JSON.parse(readFileSync(join(__dirname, "../data/substitutes-map.json"), "utf-8"));
  return subsMap!;
}

const BASE_URL = process.env.BC_URL!;
function bcAuth() {
  return "Basic " + Buffer.from(`${process.env.BC_USERNAME}:${process.env.BC_PASSWORD}`).toString("base64");
}
const HDR = () => ({ Authorization: bcAuth(), Accept: "application/json" });

async function paginatedFetch<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: HDR() });
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

async function fetchBcItemsFull(): Promise<Map<string, BcItem>> {
  const rows = await paginatedFetch<BcItem>(
    `${BASE_URL}/Item?$select=No,Description,InventoryField,Unit_Cost,Base_Unit_of_Measure,Vendor_No,Lead_Time_Calculation&$top=500`
  );
  return new Map(rows.map((r) => [r.No.trim(), r]));
}

async function fetchVendors(): Promise<Map<string, BcVendor>> {
  const rows = await paginatedFetch<BcVendor>(
    `${BASE_URL}/Dobavitelji?$select=No,Name,Lead_Time_Calculation&$top=500`
  );
  return new Map(rows.map((v) => [v.No.trim(), v]));
}

async function fetchProdComponents(): Promise<ProdComp[]> {
  return paginatedFetch<ProdComp>(
    `${BASE_URL}/ProdOrderComponents?$select=Status,Prod_Order_No,Item_No,Description,Remaining_Quantity,Due_Date,Unit_Cost&$top=2000`
  );
}

let schedCache: { data: ScheduleLine[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getScheduleLines(log: (m: string) => void): Promise<ScheduleLine[]> {
  if (schedCache && Date.now() - schedCache.fetchedAt < CACHE_TTL) return schedCache.data;

  log("Fetching schedule data from BC...");
  const [itemsMap, vendorsMap, prodComps] = await Promise.all([
    fetchBcItemsFull(),
    fetchVendors(),
    fetchProdComponents(),
  ]);
  log(`Loaded ${itemsMap.size} items, ${vendorsMap.size} vendors, ${prodComps.length} prod components`);

  const substitutesMap = getSubstitutesMap();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Pre-compute sub stocks per item (in item's own UoM)
  const subStockCache = new Map<string, number>();
  const getSubStock = (itemNo: string): number => {
    if (subStockCache.has(itemNo)) return subStockCache.get(itemNo)!;
    const subs = substitutesMap[itemNo] ?? [];
    const total = subs.reduce((s, sNo) => s + (itemsMap.get(sNo)?.InventoryField ?? 0), 0);
    subStockCache.set(itemNo, total);
    return total;
  };

  const lines: ScheduleLine[] = prodComps
    .filter((r) => ACTIVE_STATUSES.has(r.Status) && r.Item_No?.trim() && r.Remaining_Quantity > 0)
    .map((r) => {
      const key = r.Item_No.trim();
      const bcItem = itemsMap.get(key);
      const uom = bcItem?.Base_Unit_of_Measure ?? "";
      const factor = UOM_FACTORS[uom] ?? 1;

      // Convert RemQty to item's native UoM (e.g. /1000 for 1000CPS items)
      const adjustedQty = r.Remaining_Quantity / factor;

      const vendorNo = bcItem?.Vendor_No?.trim() ?? "";
      const vendor = vendorNo ? vendorsMap.get(vendorNo) : undefined;
      const rawLT = bcItem?.Lead_Time_Calculation?.trim() || vendor?.Lead_Time_Calculation?.trim() || "";
      const ltDays = parseLeadTimeDays(rawLT);

      const itemStock = bcItem?.InventoryField ?? 0;
      const subStock = getSubStock(key);
      const totalAvailable = itemStock + subStock;

      let urgencyDays = 9999;
      if (r.Due_Date && r.Due_Date > "0001-01-01") {
        const due = new Date(r.Due_Date);
        due.setHours(0, 0, 0, 0);
        urgencyDays = Math.round((due.getTime() - today.getTime()) / 86400000);
      }

      return {
        item_no: key,
        opis: bcItem?.Description ?? r.Description ?? key,
        prod_order_no: r.Prod_Order_No,
        status: r.Status,
        remaining_qty: adjustedQty,
        uom,
        due_date: r.Due_Date ?? "",
        urgency_days: urgencyDays,
        item_stock: itemStock,
        sub_stock: subStock,
        total_available: totalAvailable,
        cena: bcItem?.Unit_Cost ?? r.Unit_Cost ?? 0,
        vendor_no: vendorNo,
        vendor_name: vendor?.Name ?? (vendorNo ? vendorNo : "Ni določen"),
        lead_time: rawLT || "—",
        lead_time_days: ltDays,
      };
    })
    .sort((a, b) => {
      if (a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
      return a.item_no.localeCompare(b.item_no);
    });

  schedCache = { data: lines, fetchedAt: Date.now() };
  return lines;
}

export function invalidateScheduleCache() { schedCache = null; }

router.get("/schedule", async (req, res) => {
  try {
    res.json(await getScheduleLines((m) => req.log.info(m)));
  } catch (err) {
    req.log.error({ err }, "Failed to load schedule");
    res.status(500).json({ error: "Failed to load schedule" });
  }
});

export default router;
