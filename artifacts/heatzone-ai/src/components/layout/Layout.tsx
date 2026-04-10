import { ReactNode, useState, useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useQueryClient } from "@tanstack/react-query";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const queryClient = useQueryClient();
  const hasRefreshed = useRef(false);

  // Auto-refresh weather data on page load/reload — silently in the background
  useEffect(() => {
    if (hasRefreshed.current) return;
    hasRefreshed.current = true;

    fetch("/api/weather/refresh", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        console.log(`[AutoRefresh] ${data.citiesUpdated} cities updated, JSON dataset appended`);
        // Invalidate all data caches so the UI updates with fresh data
        queryClient.invalidateQueries({ queryKey: ["/api/datasets/overview"] });
        queryClient.invalidateQueries({ queryKey: ["/api/heatzone/all"] });
        queryClient.invalidateQueries({ queryKey: ["/api/weather"] });
        queryClient.invalidateQueries({ queryKey: ["/api/forecast"] });
      })
      .catch((err) => console.warn("[AutoRefresh] Background refresh failed:", err));
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 ml-0 md:ml-64 relative z-0">
          <div className="absolute inset-0 bg-[url('artifacts/heatzone-ai/public/images/bg-glow.png')] bg-cover bg-center opacity-10 pointer-events-none -z-10 mix-blend-screen" />
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

