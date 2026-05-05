import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const ACTIVE_STATUSES = new Set(["Načrtovano", "Potrjen", "Izdano", "Čvrsto načrtovano"]);

const EXCLUDED_ITEMS = new Set(["000180"]);

// UoM conversion: ProdOrderComponents.Remaining_Quantity is always in base KOS/CPS/KG.
// For items stored per 1000 units, divide RemQty by this factor to match Item.InventoryField units.
const UOM_FACTORS: Record<string, number> = {
  "1000CPS": 1000,
};

type BcItem = {
  No: string;
  Description: string;
  InventoryField: number;
  Unit_Cost: number;
  Base_Unit_of_Measure: string;
  Replenishment_System: string;
};

type ProdComp = {
  Status: string;
  Prod_Order_No: string;
  Item_No: string;
  Description: string;
  Remaining_Quantity: number;
  Due_Date: string;
  Unit_Cost: number;
};

export type Material = {
  st: string;
  opis: string;
  zaloga: number;
  cena: number;
  uom: string;
  replenishment: string;
  kolicina: number;
  totalSubStock: number;
  dejansko: number;
  nadomestki: Array<{ st: string; opis: string; zaloga: number; cena: number; uom: string }>;
};

let subsMap: Record<string, string[]> | null = null;
function getSubstitutesMap(): Record<string, string[]> {
  if (subsMap) return subsMap;
  const p = join(__dirname, "../data/substitutes-map.json");
  subsMap = JSON.parse(readFileSync(p, "utf-8"));
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

async function fetchBcItems(): Promise<Map<string, BcItem>> {
  const rows = await paginatedFetch<BcItem>(
    `${BASE_URL}/Item?$select=No,Description,InventoryField,Unit_Cost,Base_Unit_of_Measure,Replenishment_System&$top=500`
  );
  return new Map(rows.map((r) => [r.No.trim(), r]));
}

// Aggregate active production order components by item, applying UoM conversion
async function fetchProdNeeds(itemsMap: Map<string, BcItem>): Promise<Map<string, { qty: number; earliestDue: string }>> {
  const rows = await paginatedFetch<ProdComp>(
    `${BASE_URL}/ProdOrderComponents?$select=Status,Item_No,Remaining_Quantity,Due_Date,Unit_Cost&$top=2000`
  );
  const map = new Map<string, { qty: number; earliestDue: string }>();
  for (const r of rows) {
    const key = r.Item_No?.trim();
    if (!key || !ACTIVE_STATUSES.has(r.Status) || r.Remaining_Quantity <= 0 || EXCLUDED_ITEMS.has(key)) continue;

    const uom = itemsMap.get(key)?.Base_Unit_of_Measure ?? "";
    const factor = UOM_FACTORS[uom] ?? 1;
    const adjustedQty = r.Remaining_Quantity / factor;

    const existing = map.get(key);
    if (existing) {
      existing.qty += adjustedQty;
      if (r.Due_Date && r.Due_Date > "0001-01-01" && r.Due_Date < existing.earliestDue) {
        existing.earliestDue = r.Due_Date;
      }
    } else {
      map.set(key, { qty: adjustedQty, earliestDue: r.Due_Date ?? "" });
    }
  }
  return map;
}

let bcCache: { data: Material[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getMaterialsWithLiveData(log: (msg: string) => void): Promise<Material[]> {
  if (bcCache && Date.now() - bcCache.fetchedAt < CACHE_TTL) return bcCache.data;

  log("Fetching BC Items + ProdOrderComponents...");
  const itemsMap = await fetchBcItems();
  const prodNeeds = await fetchProdNeeds(itemsMap);
  log(`BC: ${itemsMap.size} items, ${prodNeeds.size} items with active production needs`);

  const substitutesMap = getSubstitutesMap();
  const materials: Material[] = [];

  for (const [itemNo, need] of prodNeeds) {
    const bcItem = itemsMap.get(itemNo);
    const zaloga = bcItem?.InventoryField ?? 0;
    const cena = bcItem?.Unit_Cost ?? 0;
    const uom = bcItem?.Base_Unit_of_Measure ?? "";
    const replenishment = bcItem?.Replenishment_System ?? "";
    const opis = bcItem?.Description ?? itemNo;

    const subNos = substitutesMap[itemNo] ?? [];
    const nadomestki = subNos.map((sNo) => {
      const sub = itemsMap.get(sNo);
      return {
        st: sNo,
        opis: sub?.Description ?? sNo,
        zaloga: sub?.InventoryField ?? 0,
        cena: sub?.Unit_Cost ?? 0,
        uom: sub?.Base_Unit_of_Measure ?? "",
      };
    });

    const totalSubStock = nadomestki.reduce((s, n) => s + n.zaloga, 0);
    const dejansko = Math.max(0, need.qty - zaloga - totalSubStock);

    materials.push({ st: itemNo, opis, zaloga, cena, uom, replenishment, kolicina: need.qty, totalSubStock, dejansko, nadomestki });
  }

  // Default sort: price descending (most expensive first)
  materials.sort((a, b) => b.cena - a.cena || a.st.localeCompare(b.st));

  bcCache = { data: materials, fetchedAt: Date.now() };
  return materials;
}

export function invalidateMaterialsCache() { bcCache = null; }

router.get("/materials", async (req, res) => {
  try {
    res.json(await getMaterialsWithLiveData((m) => req.log.info(m)));
  } catch (err) {
    req.log.error({ err }, "Failed to load materials");
    res.status(500).json({ error: "Failed to load materials" });
  }
});

router.post("/materials/refresh", async (req, res) => {
  invalidateMaterialsCache();
  try {
    const data = await getMaterialsWithLiveData((m) => req.log.info(m));
    res.json({ ok: true, count: data.length });
  } catch (err) {
    req.log.error({ err }, "Failed to refresh");
    res.status(500).json({ error: "Failed to refresh" });
  }
});

export default router;
