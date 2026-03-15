import { Link, useLocation } from "wouter";
import { LayoutDashboard, Map as MapIcon, BarChart2, MapPin, Loader2 } from "lucide-react";
import { useGetCities } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const [location] = useLocation();
  const { data: cities, isLoading } = useGetCities();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/map", label: "Heat Map", icon: MapIcon },
    { href: "/analytics", label: "Analytics", icon: BarChart2 },
  ];

  return (
    <aside className="w-64 bg-card border-r border-border/50 h-screen flex flex-col fixed left-0 top-0 z-40 hidden md:flex">
      <div className="p-6 flex items-center gap-3 border-b border-border/50">
        <img 
          src={`${import.meta.env.BASE_URL}images/logo-mark.png`} 
          alt="HeatZone AI Logo" 
          className="w-8 h-8 object-contain"
        />
        <span className="font-display font-bold text-xl tracking-tight text-white">HeatZone <span className="text-primary">AI</span></span>
      </div>

      <div className="flex-1 overflow-y-auto py-6 px-4 space-y-8 custom-scrollbar">
        
        {/* Main Navigation */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Overview</p>
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group font-medium",
                  isActive 
                    ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* City Quick Links */}
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Monitored Cities</p>
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : (
            cities?.map((city) => {
              const cityHref = `/city/${city.id}`;
              const isActive = location === cityHref;
              return (
                <Link 
                  key={city.id} 
                  href={cityHref}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-200 group text-sm",
                    isActive 
                      ? "bg-secondary/80 text-foreground shadow-sm" 
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <MapPin className={cn("w-4 h-4", isActive ? "text-primary" : "opacity-50")} />
                  {city.name}
                </Link>
              );
            })
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground/60">
        UP Urban Heat Intelligence<br/>v1.0.0
      </div>
    </aside>
  );
}
