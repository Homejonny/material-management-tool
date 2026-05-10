import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MaterialsPage from "@/pages/MaterialsPage";
import SchedulePage from "@/pages/SchedulePage";
import OrdersPage from "@/pages/OrdersPage";
import InquiryPage from "@/pages/InquiryPage";
import QuotesPage from "@/pages/QuotesPage";
import { Package, CalendarClock, ShoppingCart, FileText, Inbox } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

type Page = "materials" | "schedule" | "orders" | "inquiry" | "quotes";

function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
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
        </nav>
      </div>
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("materials");

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Nav page={page} setPage={setPage} />
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
