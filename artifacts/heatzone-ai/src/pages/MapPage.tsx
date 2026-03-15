import { useGetAllHeatPredictions } from "@workspace/api-client-react";
import { MapContainer, TileLayer, CircleMarker, Popup, ZoomControl } from "react-leaflet";
import { Link } from "wouter";
import { HeatZoneBadge } from "@/components/HeatZoneBadge";
import { getHeatZoneHex } from "@/lib/utils";
import { AlertCircle, ThermometerSun, Loader2, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function MapPage() {
  const { data: cities, isLoading, error } = useGetAllHeatPredictions();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !cities) {
    return (
      <div className="p-8 text-center text-red-400 bg-red-500/10 rounded-2xl border border-red-500/20 max-w-lg mx-auto mt-20">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Failed to load map data</h2>
        <p>Could not fetch heat zone predictions. Please check your connection or try syncing data.</p>
      </div>
    );
  }

  // Centered on Uttar Pradesh
  const center: [number, number] = [26.8467, 80.9462];

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div>
        <h1 className="text-3xl font-display font-bold text-white mb-2">Geospatial Analysis</h1>
        <p className="text-muted-foreground">Interactive map of Uttar Pradesh urban heat islands.</p>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex-1 rounded-2xl overflow-hidden border border-border/50 shadow-2xl shadow-black/20 relative z-0"
      >
        <MapContainer 
          center={center} 
          zoom={7} 
          style={{ height: '100%', width: '100%', background: 'hsl(var(--background))' }}
          zoomControl={false}
        >
          {/* Using CartoDB Dark Matter for sleek dashboard aesthetic */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <ZoomControl position="bottomright" />

          {cities.map((city) => {
            const color = getHeatZoneHex(city.heatZone);
            return (
              <CircleMarker
                key={city.cityId}
                center={[city.latitude, city.longitude]}
                radius={city.heatRiskScore / 3} // Dynamic radius based on risk
                pathOptions={{
                  color: color,
                  fillColor: color,
                  fillOpacity: 0.4,
                  weight: 2,
                }}
              >
                <Popup className="custom-popup">
                  <div className="p-1 min-w-[200px]">
                    <div className="flex justify-between items-start mb-3">
                      <h3 className="font-display font-bold text-lg text-foreground m-0 leading-none">{city.cityName}</h3>
                      <HeatZoneBadge zone={city.heatZone} showIcon={false} />
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between items-center text-sm border-b border-border/50 pb-1">
                        <span className="text-muted-foreground">Risk Score</span>
                        <span className="font-mono font-bold" style={{ color }}>{city.heatRiskScore.toFixed(1)}/100</span>
                      </div>
                      <div className="flex justify-between items-center text-sm border-b border-border/50 pb-1">
                        <span className="text-muted-foreground">Temperature</span>
                        <span className="font-semibold">{city.temperature.toFixed(1)} °C</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Green Cover</span>
                        <span className="font-semibold">{city.greenCoverRatio.toFixed(1)}%</span>
                      </div>
                    </div>

                    <Link 
                      href={`/city/${city.cityId}`}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground py-2 rounded-lg text-sm font-bold transition-colors"
                    >
                      View Full Analysis <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        
        {/* Legend Overlay */}
        <div className="absolute top-4 right-4 z-[400] bg-card/90 backdrop-blur-md border border-border p-4 rounded-xl shadow-xl">
          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Heat Zones</h4>
          <div className="space-y-2">
            {[
              { label: 'Extreme (>80)', color: 'bg-red-500' },
              { label: 'High (60-80)', color: 'bg-orange-500' },
              { label: 'Moderate (30-60)', color: 'bg-yellow-500' },
              { label: 'Cool (<30)', color: 'bg-green-500' }
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-foreground">
                <span className={`w-3 h-3 rounded-full ${item.color} shadow-[0_0_8px_currentColor]`}></span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
