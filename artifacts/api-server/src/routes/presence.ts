import { Router } from "express";

const router = Router();

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

const TIMEOUT_MS = 45_000;

type UserRecord = {
  clientId: string;
  name: string;
  lastSeen: Date;
  color: string;
};

const activeUsers = new Map<string, UserRecord>();
const clientColors = new Map<string, string>();

function assignColor(clientId: string): string {
  if (clientColors.has(clientId)) return clientColors.get(clientId)!;
  const idx = clientColors.size % COLORS.length;
  const color = COLORS[idx];
  clientColors.set(clientId, color);
  return color;
}

function pruneInactive() {
  const cutoff = Date.now() - TIMEOUT_MS;
  for (const [id, user] of activeUsers) {
    if (user.lastSeen.getTime() < cutoff) {
      activeUsers.delete(id);
    }
  }
}

router.post("/presence/heartbeat", (req, res) => {
  const { clientId, name } = req.body as { clientId?: string; name?: string };
  if (!clientId || !name) {
    res.status(400).json({ error: "clientId and name required" });
    return;
  }
  pruneInactive();
  activeUsers.set(clientId, {
    clientId,
    name: String(name).slice(0, 40),
    lastSeen: new Date(),
    color: assignColor(clientId),
  });
  res.json({ ok: true });
});

router.get("/presence/active", (_req, res) => {
  pruneInactive();
  const users = [...activeUsers.values()].map(u => ({
    clientId: u.clientId,
    name: u.name,
    lastSeen: u.lastSeen.toISOString(),
    color: u.color,
  }));
  res.json(users);
});

export default router;
