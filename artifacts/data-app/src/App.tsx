import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MaterialsPage from "@/pages/MaterialsPage";
import SchedulePage from "@/pages/SchedulePage";
import OrdersPage from "@/pages/OrdersPage";
import InquiryPage from "@/pages/InquiryPage";
import QuotesPage from "@/pages/QuotesPage";
import { Package, CalendarClock, ShoppingCart, FileText, Inbox, LogOut } from "lucide-react";
import { PinLogin, loadSession, clearSession, type AppUser } from "@/components/PinLogin";
import { PresenceBar } from "@/components/PresenceBar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

type Page = "materials" | "schedule" | "orders" | "inquiry" | "quotes";

function Nav({
  page,
  setPage,
  user,
  onLogout,
}: {
  page: Page;
  setPage: (p: Page) => void;
  user: AppUser;
  onLogout: () => void;
}) {
  const tabs: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: "materials", label: "Pregled nabave", icon: <Package className="w-4 h-4" /> },
    { id: "schedule", label: "Terminski plan", icon: <CalendarClock className="w-4 h-4" /> },
    { id: "orders", label: "Predlog naročil", icon: <ShoppingCart className="w-4 h-4" /> },
    { id: "inquiry", label: "Povpraševanje", icon: <FileText className="w-4 h-4" /> },
    { id: "quotes", label: "Prejete ponudbe", icon: <Inbox className="w-4 h-4" /> },
  ];
  return (
    <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border print:hidden">
      <div className="max-w-[1600px] mx-auto px-6">
        <nav className="flex gap-1 h-12 items-center">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setPage(t.id)}
              className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors ${
                page === t.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-4">
            <PresenceBar name={user.name} />
            <div className="flex items-center gap-2 pl-4 border-l border-border">
              <span className="text-sm text-foreground font-medium">{user.name}</span>
              {user.role === "admin" && (
                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">admin</span>
              )}
              <button
                onClick={onLogout}
                title="Odjava"
                className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </nav>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("materials");
  const [user, setUser] = useState<AppUser | null>(() => loadSession());

  function handleLogin(u: AppUser) {
    setUser(u);
  }

  function handleLogout() {
    clearSession();
    setUser(null);
  }

  if (!user) {
    return <PinLogin onLogin={handleLogin} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Nav page={page} setPage={setPage} user={user} onLogout={handleLogout} />
        {page === "materials" && <MaterialsPage />}
        {page === "schedule" && <SchedulePage />}
        {page === "orders" && <OrdersPage />}
        {page === "inquiry" && <InquiryPage />}
        {page === "quotes" && <QuotesPage />}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
