import { useState } from "react";

export type AppUser = {
  name: string;
  role: "user" | "admin";
};

const USERS: { name: string; pin: string; role: "user" | "admin" }[] = [
  { name: "Domen", pin: "0001", role: "user" },
  { name: "Darko", pin: "0002", role: "user" },
  { name: "Janez", pin: "0203", role: "admin" },
  { name: "Črt", pin: "1234", role: "admin" },
];

const STORAGE_KEY = "nabave_session";

export function saveSession(user: AppUser) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

export function loadSession(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.name && parsed?.role) return parsed as AppUser;
    return null;
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

type Props = {
  onLogin: (user: AppUser) => void;
};

export function PinLogin({ onLogin }: Props) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const selectedUser = USERS.find(u => u.name === selectedName);

  function handleDigit(d: string) {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError(false);

    if (next.length === 4) {
      setTimeout(() => {
        if (!selectedUser) return;
        if (next === selectedUser.pin) {
          const appUser: AppUser = { name: selectedUser.name, role: selectedUser.role };
          saveSession(appUser);
          onLogin(appUser);
        } else {
          setShake(true);
          setError(true);
          setTimeout(() => {
            setPin("");
            setShake(false);
          }, 600);
        }
      }, 120);
    }
  }

  function handleBackspace() {
    setPin(p => p.slice(0, -1));
    setError(false);
  }

  function handleSelectName(name: string) {
    setSelectedName(name);
    setPin("");
    setError(false);
  }

  const regularUsers = USERS.filter(u => u.role === "user");
  const adminUsers = USERS.filter(u => u.role === "admin");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6 space-y-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">Pregled nabave</h1>
          <p className="text-sm text-muted-foreground">Izberite uporabnika in vnesite PIN</p>
        </div>

        {!selectedName ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Uporabniki</p>
              {regularUsers.map(u => (
                <button
                  key={u.name}
                  onClick={() => handleSelectName(u.name)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  {u.name}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">Administratorji</p>
              {adminUsers.map(u => (
                <button
                  key={u.name}
                  onClick={() => handleSelectName(u.name)}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium text-foreground"
                >
                  {u.name}
                  <span className="ml-2 text-xs text-muted-foreground font-normal">(admin)</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <button
              onClick={() => { setSelectedName(null); setPin(""); setError(false); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Nazaj
            </button>

            <div className="text-center space-y-1">
              <p className="text-base font-semibold text-foreground">{selectedName}</p>
              <p className="text-xs text-muted-foreground">Vnesite 4-mestni PIN</p>
            </div>

            <div className={`flex justify-center gap-3 ${shake ? "animate-[wiggle_0.5s_ease-in-out]" : ""}`}>
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className={`w-4 h-4 rounded-full border-2 transition-colors ${
                    i < pin.length
                      ? error ? "bg-destructive border-destructive" : "bg-foreground border-foreground"
                      : "bg-transparent border-muted-foreground/40"
                  }`}
                />
              ))}
            </div>

            {error && (
              <p className="text-center text-xs text-destructive">Napačen PIN. Poskusite znova.</p>
            )}

            <div className="grid grid-cols-3 gap-3">
              {["1","2","3","4","5","6","7","8","9"].map(d => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className="h-14 rounded-xl text-lg font-medium bg-card border border-border hover:bg-muted active:scale-95 transition-all text-foreground"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                onClick={() => handleDigit("0")}
                className="h-14 rounded-xl text-lg font-medium bg-card border border-border hover:bg-muted active:scale-95 transition-all text-foreground"
              >
                0
              </button>
              <button
                onClick={handleBackspace}
                className="h-14 rounded-xl text-lg font-medium bg-card border border-border hover:bg-muted active:scale-95 transition-all text-muted-foreground"
              >
                ⌫
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
