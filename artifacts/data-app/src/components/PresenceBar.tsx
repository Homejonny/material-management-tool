import { useEffect, useRef, useState } from "react";
import { useGetActiveUsers, usePresenceHeartbeat } from "@workspace/api-client-react";

const HEARTBEAT_MS = 20_000;
const POLL_MS = 10_000;

function getOrCreateClientId(): string {
  let id = localStorage.getItem("presence_client_id");
  if (!id) {
    const clientId = Math.random().toString(36).slice(2);
    localStorage.setItem("presence_client_id", clientId);
    id = clientId;
  }
  return id;
}

function getStoredName(): string {
  return localStorage.getItem("presence_name") ?? "";
}

function Avatar({ name, color, isYou }: { name: string; color: string; isYou: boolean }) {
  const initials = name
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative group" title={name + (isYou ? " (vi)" : "")}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white select-none ${isYou ? "ring-2 ring-offset-1 ring-white" : ""}`}
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
      {isYou && (
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-background" />
      )}
      <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-foreground text-background text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
        {name}{isYou ? " (vi)" : ""}
      </div>
    </div>
  );
}

type PresenceBarProps = {
  name: string;
};

export function PresenceBar({ name }: PresenceBarProps) {
  const clientId = useRef(getOrCreateClientId());
  const { mutate: sendHeartbeat } = usePresenceHeartbeat();
  const { data: activeUsers, refetch } = useGetActiveUsers({ query: { refetchInterval: POLL_MS } });

  useEffect(() => {
    if (!name) return;
    const beat = () => sendHeartbeat({ data: { clientId: clientId.current, name } });
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [name, sendHeartbeat]);

  useEffect(() => {
    refetch();
  }, []);

  const users = activeUsers ?? [];
  const others = users.filter(u => u.clientId !== clientId.current);
  const me = users.find(u => u.clientId === clientId.current);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Aktivni:</span>
      <div className="flex items-center -space-x-1.5">
        {me && <Avatar key={me.clientId} name={me.name} color={me.color} isYou={true} />}
        {others.map(u => (
          <Avatar key={u.clientId} name={u.name} color={u.color} isYou={false} />
        ))}
      </div>
      {users.length > 1 && (
        <span className="text-xs text-muted-foreground">{users.length} aktivnih</span>
      )}
    </div>
  );
}

type NameDialogProps = {
  onConfirm: (name: string) => void;
};

export function NameDialog({ onConfirm }: NameDialogProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    localStorage.setItem("presence_name", trimmed);
    onConfirm(trimmed);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl p-8 w-full max-w-sm space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-foreground">Dobrodošli</h2>
          <p className="text-sm text-muted-foreground">Vnesite vaše ime, da bodo drugi videli, da ste aktivni.</p>
        </div>
        <input
          autoFocus
          type="text"
          placeholder="Ime in priimek"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && submit()}
          className="w-full px-3 py-2 rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm"
          maxLength={40}
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          Potrdi
        </button>
      </div>
    </div>
  );
}

export function usePresence() {
  const [name, setName] = useState<string | null>(() => {
    const stored = getStoredName();
    return stored || null;
  });

  const confirmName = (n: string) => setName(n);

  return { name, confirmName };
}
