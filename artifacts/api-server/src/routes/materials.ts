import { Router } from "express";

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
  Purch_Unit_of_Measure: string;
  Replenishment_System: string;
  Substitutes_Exist: boolean;
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
  nadomestki: Array<{ st: string; opis: string; zaloga: number; cena: number; uom: string }>;
};

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

type BcWorkflowItem = {
  number: string;
  orderMultiple: number;
  minimumOrderQuantity: number;
  netWeight: number;
  purchUnitOfMeasure: string;
};

async function fetchBcOrderMultiples(): Promise<{ multiples: Map<string, number>; weights: Map<string, { netWeight: number; purchUoM: string }> }> {
  const rows = await paginatedFetch<BcWorkflowItem>(
    `${BASE_URL}/workflowItems?$select=number,orderMultiple,minimumOrderQuantity,netWeight,purchUnitOfMeasure&$top=500`
  );
  const multiples = new Map<string, number>();
  const weights = new Map<string, { netWeight: number; purchUoM: string }>();
  for (const r of rows) {
    const key = r.number?.trim();
    if (!key) continue;
    const val = r.orderMultiple > 0 ? r.orderMultiple : r.minimumOrderQuantity;
    if (val > 0) multiples.set(key, val);
    if (r.netWeight > 0 || r.purchUnitOfMeasure) {
      weights.set(key, { netWeight: r.netWeight ?? 0, purchUoM: r.purchUnitOfMeasure?.trim() ?? "" });
    }
  }
  return { multiples, weights };
}

async function fetchBcItems(): Promise<Map<string, BcItem>> {
  const rows = await paginatedFetch<BcItem>(
    `${BASE_URL}/Item?$select=No,Description,InventoryField,Unit_Cost,Base_Unit_of_Measure,Purch_Unit_of_Measure,Replenishment_System,Substitutes_Exist&$top=500`
  );
  return new Map(rows.map((r) => [r.No.trim(), r]));
}

type BcItemSubstitution = {
  No: string;           // the substitute item
  Substitute_No: string; // the main item (the one being substituted)
  Type: string;
  Substitute_Type: string;
  Interchangeable: boolean;
};

// Returns map: itemNo → total quantity on open (future) purchase orders
type BcPurchaseQtyLine = {
  number: string;
  quantity: number;
  expectedReceiptDate: string;
};

async function fetchPurchaseOrderedQtyMap(): Promise<Map<string, number>> {
  // outstandingQuantity = ordered but not yet received
  const lines = await paginatedFetch<Record<string, unknown>>(
    `${BASE_URL}/purchaseDocumentLines?$select=number,outstandingQuantity&$top=2000`
  );
  const map = new Map<string, number>();
  for (const line of lines) {
    const key = (line["number"] as string | undefined)?.trim();
    if (!key) continue;
    const qty = (line["outstandingQuantity"] as number | undefined) ?? 0;
    if (qty <= 0) continue;
    map.set(key, (map.get(key) ?? 0) + qty);
  }
  return map;
}

// Returns map: mainItemNo → [substituteItemNo, ...]
async function fetchBcSubstitutesMap(): Promise<Record<string, string[]>> {
  const rows = await paginatedFetch<BcItemSubstitution>(
    `${BASE_URL}/Item_Substitution?$select=No,Substitute_No,Type,Substitute_Type,Interchangeable&$top=2000`
  );
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    const mainNo = r.Substitute_No?.trim();
    const subNo = r.No?.trim();
    if (!mainNo || !subNo) continue;
    if (!map[mainNo]) map[mainNo] = [];
    if (!map[mainNo].includes(subNo)) map[mainNo].push(subNo);
  }
  return map;
}

type BcPurchasePrice = {
  Item_No: string;
  Vendor_No: string;
  Direct_Unit_Cost: number;
  Minimum_Quantity: number;
  Starting_Date: string;
  Ending_Date: string;
};

let purchasePriceError: string | null = null;
let purchasePriceCount: number = 0;

async function fetchPurchasePriceMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  purchasePriceError = null;
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Try known BC OData names for the Purchase Price table (7012)
    // "purchasePrice" confirmed working by debug endpoint
    const candidates = ["purchasePrice", "purchasePrices", "PurchasePrice", "PurchasePrices"];
    let rows: BcPurchasePrice[] = [];
    let usedEndpoint = "";
    for (const name of candidates) {
      try {
        const url = `${BASE_URL}/${name}?$select=Item_No,Vendor_No,Direct_Unit_Cost,Minimum_Quantity,Starting_Date,Ending_Date&$top=2000`;
        rows = await paginatedFetch<BcPurchasePrice>(url);
        usedEndpoint = name;
        break;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        // 404 or similar — try next candidate
        if (!msg.includes("404") && !msg.includes("400")) {
          throw e; // unexpected error — propagate
        }
      }
    }

    if (!usedEndpoint) {
      purchasePriceError = "Endpoint za tabelo 7012 ni bil najden (preizkušeno: " + candidates.join(", ") + "). Prosim preverite ime OData strani v BC.";
      purchasePriceCount = 0;
      return map;
    }

    // For each item keep the lowest valid price (valid date range)
    for (const r of rows) {
      const key = r.Item_No?.trim();
      if (!key || !r.Direct_Unit_Cost || r.Direct_Unit_Cost <= 0) continue;
      const startOk = !r.Starting_Date || r.Starting_Date <= today || r.Starting_Date.startsWith("0001");
      const endOk = !r.Ending_Date || r.Ending_Date >= today || r.Ending_Date.startsWith("0001");
      if (!startOk || !endOk) continue;
      const existing = map.get(key);
      if (existing === undefined || r.Direct_Unit_Cost < existing) {
        map.set(key, r.Direct_Unit_Cost);
      }
    }
    purchasePriceCount = map.size;
  } catch (e: unknown) {
    purchasePriceError = e instanceof Error ? e.message : String(e);
    purchasePriceCount = 0;
  }
  return map;
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

  log("Fetching BC Items + ProdOrderComponents + Substitutes + Purchase Orders...");
  const [itemsMap, bcWorkflowData, purchasePriceMap, substitutesMap, purchaseOrderedMap] = await Promise.all([
    fetchBcItems(),
    fetchBcOrderMultiples(),
    fetchPurchasePriceMap(),
    fetchBcSubstitutesMap(),
    fetchPurchaseOrderedQtyMap(),
  ]);
  const bcMultiplesMap = bcWorkflowData.multiples;
  const bcWeightsMap = bcWorkflowData.weights;
  const prodNeeds = await fetchProdNeeds(itemsMap);
  log(`BC: ${itemsMap.size} items, ${prodNeeds.size} with prod needs, ${purchasePriceCount} prices, ${Object.keys(substitutesMap).length} items with substitutes, ${purchaseOrderedMap.size} items on order${purchasePriceError ? " | CENIK ERROR: " + purchasePriceError : ""}`);

  const materials: Material[] = [];

  for (const [itemNo, need] of prodNeeds) {
    const bcItem = itemsMap.get(itemNo);
    const zaloga = bcItem?.InventoryField ?? 0;
    const unitCost = bcItem?.Unit_Cost ?? 0;
    const uom = bcItem?.Base_Unit_of_Measure ?? "";
    const replenishment = bcItem?.Replenishment_System ?? "";
    const opis = bcItem?.Description ?? itemNo;

    let cena = unitCost;
    let price_source: Material["price_source"] = "unit_cost";

    if (!cena || cena <= 0) {
      const priceListCena = purchasePriceMap.get(itemNo);
      if (priceListCena && priceListCena > 0) {
        cena = priceListCena;
        price_source = "price_list";
      } else {
        cena = 0;
        price_source = "missing";
      }
    }

    // Build live nadomestki array from BC Item_Substitution endpoint
    const subNos = substitutesMap[itemNo] ?? [];
    const nadomestki: Material["nadomestki"] = subNos.map((sNo) => {
      const sItem = itemsMap.get(sNo);
      const sUnitCost = sItem?.Unit_Cost ?? 0;
      const sCena = sUnitCost > 0 ? sUnitCost : (purchasePriceMap.get(sNo) ?? 0);
      return {
        st: sNo,
        opis: sItem?.Description ?? sNo,
        zaloga: sItem?.InventoryField ?? 0,
        cena: sCena,
        uom: sItem?.Base_Unit_of_Measure ?? "",
      };
    });

    // Count substitute stock + substitute on-order quantities
    const totalSubStock = nadomestki.reduce((sum, s) => sum + s.zaloga + (purchaseOrderedMap.get(s.st) ?? 0), 0);
    const has_substitutes = nadomestki.length > 0 || (bcItem?.Substitutes_Exist ?? false);
    // Subtract own stock + own on-order qty + substitute (stock + on-order)
    const ownOrdered = purchaseOrderedMap.get(itemNo) ?? 0;
    const dejansko = Math.max(0, need.qty - zaloga - ownOrdered - totalSubStock);
    const order_multiple = bcMultiplesMap.get(itemNo) ?? 0;
    const order_qty = order_multiple > 0 ? Math.ceil(dejansko / order_multiple) * order_multiple : dejansko;

    // Apply purchase UoM conversion if needed
    // BC stores Unit_Cost per Purch_Unit_of_Measure (KG), not per Base_Unit_of_Measure (KOS)
    // netWeight = KG per KOS → price_per_KOS = price_per_KG × netWeight
    let correctedCena = cena;
    const purchUoM = bcItem?.Purch_Unit_of_Measure?.trim() ?? "";
    if (purchUoM === "KG" && purchUoM !== uom) {
      const wData = bcWeightsMap.get(itemNo);
      if (wData && wData.netWeight > 0) {
        correctedCena = Math.round(cena * wData.netWeight * 100000) / 100000;
      }
    }
    const order_value = Math.round(correctedCena * order_qty * 100) / 100;

    materials.push({ st: itemNo, opis, zaloga, cena: correctedCena, price_source, uom, replenishment, kolicina: need.qty, totalSubStock, dejansko, order_multiple, order_qty, order_value, has_substitutes, nadomestki });
  }

  // Default sort: price descending (most expensive first)
  materials.sort((a, b) => b.cena - a.cena || a.st.localeCompare(b.st));

  bcCache = { data: materials, fetchedAt: Date.now() };
  return materials;
}

export function invalidateMaterialsCache() { bcCache = null; }

// Diagnostic endpoint — returns raw purchase document line fields to identify quantity field name
router.get("/materials/purchase-lines-debug", async (req, res) => {
  try {
    const rows = await paginatedFetch<Record<string, unknown>>(
      `${BASE_URL}/purchaseDocumentLines?$top=3`
    );
    res.json({ count: rows.length, sample: rows.slice(0, 3), keys: rows[0] ? Object.keys(rows[0]) : [] });
  } catch (e: unknown) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// Diagnostic endpoint — returns raw purchase price rows from BC
router.get("/materials/purchase-prices-debug", async (req, res) => {
  const candidates = ["purchasePrices", "purchasePrice", "PurchasePrice", "PurchasePrices"];
  for (const name of candidates) {
    try {
      const url = `${BASE_URL}/${name}?$top=20`;
      const rows = await paginatedFetch<Record<string, unknown>>(url);
      res.json({ endpoint: name, count: rows.length, sample: rows.slice(0, 5) });
      return;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("404") && !msg.includes("400")) {
        res.status(500).json({ error: msg, tried: name });
        return;
      }
    }
  }
  res.status(404).json({ error: "Noben endpoint ni deloval", tried: candidates });
});

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
