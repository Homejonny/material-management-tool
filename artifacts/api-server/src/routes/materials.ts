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
  nadomestki: Array<{ st: string | number; opis: string; zaloga: number; cena: number }>;
};

type BcItem = {
  No: string;
  Description: string;
  InventoryField: number;
  Unit_Cost: number;
  Substitutes_Exist: boolean;
};

let staticMaterials: StaticMaterial[] | null = null;

function getStaticMaterials(): StaticMaterial[] {
  if (staticMaterials) return staticMaterials;
  const dataPath = join(__dirname, "../data/materials.json");
  const raw = readFileSync(dataPath, "utf-8");
  staticMaterials = JSON.parse(raw);
  return staticMaterials!;
}

async function fetchAllBcItems(log: (msg: string) => void): Promise<Map<string, BcItem>> {
  const baseUrl = process.env.BC_URL;
  const username = process.env.BC_USERNAME;
  const password = process.env.BC_PASSWORD;

  if (!baseUrl || !username || !password) {
    throw new Error("BC credentials not configured (BC_URL, BC_USERNAME, BC_PASSWORD)");
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const itemMap = new Map<string, BcItem>();
  const select = "No,Description,InventoryField,Unit_Cost,Substitutes_Exist";

  let url: string | null =
    `${baseUrl}/Item?$select=${select}&$top=500`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`BC API error ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      value: BcItem[];
      "@odata.nextLink"?: string;
    };

    for (const item of json.value) {
      itemMap.set(item.No.trim(), item);
    }

    url = json["@odata.nextLink"] ?? null;
    if (url) log(`Fetched ${itemMap.size} items so far, loading next page...`);
  }

  log(`Loaded ${itemMap.size} items from Business Central`);
  return itemMap;
}

let bcCache: { data: StaticMaterial[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getMaterialsWithLiveData(log: (msg: string) => void): Promise<StaticMaterial[]> {
  if (bcCache && Date.now() - bcCache.fetchedAt < CACHE_TTL_MS) {
    return bcCache.data;
  }

  const [bcItems, statics] = await Promise.all([
    fetchAllBcItems(log),
    Promise.resolve(getStaticMaterials()),
  ]);

  const merged = statics.map((mat) => {
    const key = String(mat.st).trim();
    const live = bcItems.get(key);

    const liveZaloga = live?.InventoryField ?? mat.zaloga;
    const liveCena = live?.Unit_Cost ?? mat.cena;

    const enrichedNadomestki = mat.nadomestki.map((sub) => {
      const subKey = String(sub.st).trim();
      const subLive = bcItems.get(subKey);
      return {
        ...sub,
        zaloga: subLive?.InventoryField ?? sub.zaloga,
        cena: subLive?.Unit_Cost ?? sub.cena,
        opis: subLive?.Description ?? sub.opis,
      };
    });

    const totalSubStock = enrichedNadomestki.reduce((s, n) => s + n.zaloga, 0);
    const dejansko = Math.max(0, mat.kolicina - liveZaloga - totalSubStock);

    return {
      ...mat,
      zaloga: liveZaloga,
      cena: liveCena,
      nadomestki: enrichedNadomestki,
      totalSubStock,
      dejansko,
    };
  });

  bcCache = { data: merged, fetchedAt: Date.now() };
  return merged;
}

router.get("/materials", async (req, res) => {
  try {
    const data = await getMaterialsWithLiveData((msg) => req.log.info(msg));
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to load materials data");
    res.status(500).json({ error: "Failed to load materials data" });
  }
});

router.post("/materials/refresh", async (req, res) => {
  bcCache = null;
  try {
    const data = await getMaterialsWithLiveData((msg) => req.log.info(msg));
    res.json({ ok: true, count: data.length });
  } catch (err) {
    req.log.error({ err }, "Failed to refresh materials data");
    res.status(500).json({ error: "Failed to refresh" });
  }
});

export default router;
