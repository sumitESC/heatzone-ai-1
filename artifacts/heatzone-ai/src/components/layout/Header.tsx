import { useRefreshWeatherData } from "@workspace/api-client-react";
import { format } from "date-fns";
import { RefreshCw, Bell, Search, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function Header() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const refreshMutation = useRefreshWeatherData({
    mutation: {
      onSuccess: (data) => {
        // Invalidate all related queries
        queryClient.invalidateQueries({ queryKey: ['/api/datasets/overview'] });
        queryClient.invalidateQueries({ queryKey: ['/api/heatzone/all'] });
        queryClient.invalidateQueries({ queryKey: ['/api/weather'] });
        
        toast({
          title: "Data Refreshed",
          description: `Successfully updated weather for ${data.citiesUpdated} cities.`,
        });
      },
      onError: () => {
        toast({
          title: "Refresh Failed",
          description: "Could not fetch latest weather data. Please try again.",
          variant: "destructive",
        });
      }
    }
  });

  return (
    <header className="h-20 bg-background/80 backdrop-blur-xl border-b border-border/50 flex items-center justify-between px-4 sm:px-8 sticky top-0 z-30 ml-0 md:ml-64">
      <div className="flex items-center gap-4">
        <button className="md:hidden p-2 text-muted-foreground hover:text-foreground">
          <Menu className="w-6 h-6" />
        </button>
        <div className="hidden sm:flex relative group">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Search cities, regions..." 
            className="bg-secondary/50 border border-border/50 text-foreground text-sm rounded-full pl-9 pr-4 py-2 w-64 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <div className="hidden sm:block text-right">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Time</p>
          <p className="text-sm font-semibold text-foreground">{format(new Date(), 'MMM dd, yyyy • HH:mm')}</p>
        </div>

        <div className="h-8 w-px bg-border/50 hidden sm:block"></div>

        <button 
          onClick={() => refreshMutation.mutate({})}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground text-sm font-semibold rounded-full border border-border/50 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none group"
        >
          <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin text-primary' : 'text-muted-foreground group-hover:text-primary transition-colors'}`} />
          <span className="hidden sm:inline">{refreshMutation.isPending ? 'Syncing...' : 'Sync Data'}</span>
        </button>
        
        <button className="p-2 relative text-muted-foreground hover:text-foreground transition-colors bg-secondary/30 rounded-full hover:bg-secondary">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-background"></span>
        </button>
      </div>
    </header>
  );
}
