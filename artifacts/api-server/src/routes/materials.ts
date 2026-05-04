import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

let materialsCache: unknown[] | null = null;

function getMaterialsData(): unknown[] {
  if (materialsCache) return materialsCache;
  const dataPath = join(__dirname, "../data/materials.json");
  const raw = readFileSync(dataPath, "utf-8");
  materialsCache = JSON.parse(raw);
  return materialsCache!;
}

router.get("/materials", (req, res) => {
  try {
    const data = getMaterialsData();
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to load materials data");
    res.status(500).json({ error: "Failed to load materials data" });
  }
});

export default router;
