import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background flex text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
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
