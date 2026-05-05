import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MaterialsPage from "@/pages/MaterialsPage";
import SchedulePage from "@/pages/SchedulePage";
import { Package, CalendarClock } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000,
    },
  },
});

type Page = "materials" | "schedule";

function Nav({ page, setPage }: { page: Page; setPage: (p: Page) => void }) {
  return (
    <div className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="max-w-[1600px] mx-auto px-6">
        <nav className="flex gap-1 h-12 items-center">
          <button
            onClick={() => setPage("materials")}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors ${
              page === "materials"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Package className="w-4 h-4" />
            Pregled nabave
          </button>
          <button
            onClick={() => setPage("schedule")}
            className={`inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium transition-colors ${
              page === "schedule"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <CalendarClock className="w-4 h-4" />
            Terminski plan
          </button>
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
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
