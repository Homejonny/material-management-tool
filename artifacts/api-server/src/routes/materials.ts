import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

type BcItem = {
  No: string;
  Description: string;
  InventoryField: number;
  Unit_Cost: number;
  Substitutes_Exist: boolean;
};

type PlanningRow = {
  No: string;
  Description: string;
  Quantity: number;
  Order_Date: string;
  Due_Date: string;
  Unit_Cost: number;
};

type Material = {
  st: string;
  opis: string;
  zaloga: number;
  cena: number;
  kolicina: number;
  totalSubStock: number;
  dejansko: number;
  nadomestki: Array<{ st: string; opis: string; zaloga: number; cena: number }>;
};

let subsMap: Record<string, string[]> | null = null;
function getSubstitutesMap(): Record<string, string[]> {
  if (subsMap) return subsMap;
  const p = join(__dirname, "../data/substitutes-map.json");
  subsMap = JSON.parse(readFileSync(p, "utf-8"));
  return subsMap!;
}

const BASE_URL = process.env.BC_URL!;
function bcAuth(): string {
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

async function fetchBcItems(): Promise<Map<string, BcItem>> {
  const rows = await paginatedFetch<BcItem>(
    `${BASE_URL}/Item?$select=No,Description,InventoryField,Unit_Cost,Substitutes_Exist&$top=500`
  );
  return new Map(rows.map((r) => [r.No.trim(), r]));
}

// Returns map: itemNo → { totalQty, orderDate, dueDate }
async function fetchPlanningWorksheet(): Promise<Map<string, { qty: number; orderDate: string; dueDate: string; opis: string }>> {
  const rows = await paginatedFetch<PlanningRow>(
    `${BASE_URL}/PlanningWorksheet?$select=No,Description,Quantity,Order_Date,Due_Date,Unit_Cost&$top=500`
  );

  const map = new Map<string, { qty: number; orderDate: string; dueDate: string; opis: string }>();
  for (const r of rows) {
    const key = r.No?.trim();
    if (!key || r.Quantity <= 0) continue;
    const existing = map.get(key);
    if (existing) {
      existing.qty += r.Quantity;
      // Keep earliest order date
      if (r.Order_Date && r.Order_Date < existing.orderDate) existing.orderDate = r.Order_Date;
      if (r.Due_Date && r.Due_Date < existing.dueDate) existing.dueDate = r.Due_Date;
    } else {
      map.set(key, {
        qty: r.Quantity,
        orderDate: r.Order_Date ?? "",
        dueDate: r.Due_Date ?? "",
        opis: r.Description ?? key,
      });
    }
  }
  return map;
}

let bcCache: { data: Material[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getMaterialsWithLiveData(log: (msg: string) => void): Promise<Material[]> {
  if (bcCache && Date.now() - bcCache.fetchedAt < CACHE_TTL_MS) return bcCache.data;

  log("Fetching BC Items + Planning Worksheet...");
  const [itemsMap, planningMap] = await Promise.all([fetchBcItems(), fetchPlanningWorksheet()]);
  log(`BC: ${itemsMap.size} items, ${planningMap.size} planning lines`);

  const substitutesMap = getSubstitutesMap();

  const materials: Material[] = [];

  for (const [itemNo, plan] of planningMap) {
    const bcItem = itemsMap.get(itemNo);
    const zaloga = bcItem?.InventoryField ?? 0;
    const cena = bcItem?.Unit_Cost ?? 0;
    const opis = bcItem?.Description ?? plan.opis;

    const subNos = substitutesMap[itemNo] ?? [];
    const nadomestki = subNos.map((sNo) => {
      const sub = itemsMap.get(sNo);
      return {
        st: sNo,
        opis: sub?.Description ?? sNo,
        zaloga: sub?.InventoryField ?? 0,
        cena: sub?.Unit_Cost ?? 0,
      };
    });

    const totalSubStock = nadomestki.reduce((s, n) => s + n.zaloga, 0);
    const dejansko = Math.max(0, plan.qty - zaloga - totalSubStock);

    materials.push({
      st: itemNo,
      opis,
      zaloga,
      cena,
      kolicina: plan.qty,
      totalSubStock,
      dejansko,
      nadomestki,
    });
  }

  // Sort by item number ascending
  materials.sort((a, b) => a.st.localeCompare(b.st));

  bcCache = { data: materials, fetchedAt: Date.now() };
  return materials;
}

export function invalidateMaterialsCache() {
  bcCache = null;
}

router.get("/materials", async (req, res) => {
  try {
    const data = await getMaterialsWithLiveData((msg) => req.log.info(msg));
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to load materials");
    res.status(500).json({ error: "Failed to load materials" });
  }
});

router.post("/materials/refresh", async (req, res) => {
  invalidateMaterialsCache();
  try {
    const data = await getMaterialsWithLiveData((msg) => req.log.info(msg));
    res.json({ ok: true, count: data.length });
  } catch (err) {
    req.log.error({ err }, "Failed to refresh materials");
    res.status(500).json({ error: "Failed to refresh" });
  }
});

export default router;
