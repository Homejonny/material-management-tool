import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

router.get("/download/nabave-material.tar.gz", (req, res) => {
  const filePath = path.resolve("/home/runner/workspace/nabave-material.tar.gz");
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }
  res.setHeader("Content-Disposition", 'attachment; filename="nabave-material.tar.gz"');
  res.setHeader("Content-Type", "application/gzip");
  res.sendFile(filePath);
});

export default router;
