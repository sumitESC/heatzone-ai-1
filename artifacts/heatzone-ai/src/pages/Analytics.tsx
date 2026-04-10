import { useGetAllHeatPredictions, useGetCities, useGetDashboardOverview } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, LineChart, Line, Cell, PieChart, Pie, ScatterChart, Scatter, ZAxis } from 'recharts';
import { motion } from "framer-motion";
import { Activity, Car, TreePine, Building2, Cloud, Thermometer, Droplets, Wind } from "lucide-react";
import { getHeatZoneHex } from "@/lib/utils";

const CONDITION_COLORS: Record<string, string> = {
  Clear: "#facc15",
  Clouds: "#94a3b8",
  Haze: "#a78bfa",
  Rain: "#3b82f6",
  Mist: "#67e8f9",
  Drizzle: "#38bdf8",
  Thunderstorm: "#f43f5e",
  Snow: "#e2e8f0",
  Smoke: "#78716c",
  Dust: "#d97706",
  Fog: "#a1a1aa",
};

export default function Analytics() {
  const { data: predictions, isLoading: predLoading } = useGetAllHeatPredictions();
  const { data: cities, isLoading: citiesLoading } = useGetCities();
  const { data: overview, isLoading: overviewLoading } = useGetDashboardOverview();

  if (predLoading || citiesLoading || overviewLoading) {
    return (
      <div className="flex items-center justify-center h-[70vh]">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!predictions || !cities || !Array.isArray(predictions) || !Array.isArray(cities)) {
    return <div className="p-8 text-center text-red-400">Failed to load analytics data. Please refresh.</div>;
  }

  // Build city weather map from overview
  const cityWeatherMap = new Map<number, any>();
  if (overview && (overview as any).cityWeather) {
    for (const w of (overview as any).cityWeather) {
      cityWeatherMap.set(w.cityId, w);
    }
  }

  // Merge datasets for charts
  const mergedData = cities.map(city => {
    const pred = predictions.find(p => p.cityId === city.id);
    const weather = cityWeatherMap.get(city.id);
    return {
      name: city.name,
      heatRisk: pred?.heatRiskScore || 0,
      zone: pred?.heatZone || 'cool',
      temperature: weather?.temperature || pred?.temperature || 0,
      humidity: weather?.humidity || 0,
      windSpeed: weather?.windSpeed || 0,
      weatherMain: weather?.weatherMain || "Clear",
      greenCover: city.forestCover + city.urbanGreenSpace,
      vehicles: city.totalVehicles / 1000, // in thousands
      builtUp: city.builtUpArea,
      population: city.population / 1000000 // in millions
    };
  }).sort((a, b) => b.heatRisk - a.heatRisk);

  // Weather condition distribution for pie chart
  const conditionCounts: Record<string, number> = {};
  mergedData.forEach(d => {
    conditionCounts[d.weatherMain] = (conditionCounts[d.weatherMain] || 0) + 1;
  });
  const pieData = Object.entries(conditionCounts).map(([name, value]) => ({
    name,
    value,
    fill: CONDITION_COLORS[name] || "#64748b"
  }));

  // Scatter plot data: Temperature vs Humidity
  const scatterData = mergedData.map(d => ({
    x: d.temperature,
    y: d.humidity,
    z: d.heatRisk,
    name: d.name,
    zone: d.zone,
  }));

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground mb-2">Comparative Analytics</h1>
        <p className="text-muted-foreground">Cross-city analysis of heat contributors across Uttar Pradesh — powered by live weather data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Temperature vs Humidity Scatter */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
          className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-6">
            <Thermometer className="w-5 h-5 text-red-400" />
            <h3 className="font-bold text-lg">Temperature vs Humidity (Live)</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="x" name="Temperature" unit="°C" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <YAxis type="number" dataKey="y" name="Humidity" unit="%" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} />
                <ZAxis type="number" dataKey="z" range={[60, 400]} name="Heat Risk" />
                <RechartsTooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value: any, name: string) => {
                    if (name === "Temperature") return [`${value}°C`, "Temperature"];
                    if (name === "Humidity") return [`${value}%`, "Humidity"];
                    if (name === "Heat Risk") return [value, "Heat Risk Score"];
                    return [value, name];
                  }}
                  labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.name || ""}
                />
                <Scatter 
                  data={scatterData}
                  shape={(props: any) => {
                    const color = getHeatZoneHex(props.payload?.zone || 'cool');
                    return <circle cx={props.cx} cy={props.cy} r={Math.max(6, (props.payload?.z || 10) / 8)} fill={color} fillOpacity={0.7} stroke={color} strokeWidth={1.5} />;
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Weather Conditions Distribution */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-6">
            <Cloud className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-lg">Weather Conditions (Live)</h3>
          </div>
          <div className="h-[300px] w-full flex items-center">
            <div className="w-3/5 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={`pie-${i}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: any, name: string) => [`${value} cities`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-2/5 space-y-2.5 pl-4">
              {pieData.map(item => (
                <div key={item.name} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }}></span>
                  <span className="text-foreground font-medium">{item.name}</span>
                  <span className="ml-auto text-muted-foreground font-mono">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Heat vs Green Cover */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }}
          className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-6">
            <TreePine className="w-5 h-5 text-emerald-500" />
            <h3 className="font-bold text-lg">Impact of Green Cover on Heat Risk</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mergedData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} angle={-35} textAnchor="end" height={60} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Line yAxisId="left" type="monotone" dataKey="heatRisk" name="Heat Risk Score" stroke="hsl(var(--primary))" strokeWidth={3} activeDot={{ r: 8 }} />
                <Line yAxisId="right" type="monotone" dataKey="greenCover" name="Green Cover (%)" stroke="#10b981" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Wind Speed Analysis */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}
          className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg"
        >
          <div className="flex items-center gap-2 mb-6">
            <Wind className="w-5 h-5 text-sky-400" />
            <h3 className="font-bold text-lg">Live Wind Speed Across Cities</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...mergedData].sort((a, b) => b.windSpeed - a.windSpeed)} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsla(226, 30%, 16%, 0.5)' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  formatter={(value: any) => [`${value} m/s`, "Wind Speed"]}
                />
                <Bar dataKey="windSpeed" name="Wind Speed (m/s)" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Urban Infrastructure */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.4 }}
          className="bg-card border border-border/50 rounded-2xl p-6 shadow-lg lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-6">
            <Building2 className="w-5 h-5 text-orange-400" />
            <h3 className="font-bold text-lg">Urban Density & Heat Risk Correlation</h3>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mergedData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} dy={10} angle={-35} textAnchor="end" height={60} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsla(226, 30%, 16%, 0.5)' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="builtUp" name="Built-up Area (%)" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="heatRisk" name="Heat Risk" radius={[4, 4, 0, 0]}>
                  {mergedData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getHeatZoneHex(entry.zone)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
