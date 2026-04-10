/**
 * Advisory Engine — Generates domain-specific AI advisories based on
 * weather conditions, heatscore, and environmental thresholds.
 *
 * Domains: Health, Agriculture, Travel, Infrastructure, Public Safety
 */

export interface Advisory {
  domain: "health" | "agriculture" | "travel" | "infrastructure" | "public_safety";
  severity: "info" | "warning" | "alert" | "critical";
  title: string;
  message: string;
  trigger: string;
  icon: string;
}

interface AdvisoryInput {
  temperature: number;
  feelsLike?: number;
  humidity: number;
  windSpeed: number;
  pressure?: number;
  rainfall?: number;
  cloudCover?: number;
  heatRiskScore: number;
  heatZone: string;
  weatherMain?: string;
  uvIndex?: number;
  cityName: string;
}

export function generateAdvisories(input: AdvisoryInput): Advisory[] {
  const advisories: Advisory[] = [];
  const {
    temperature, feelsLike, humidity, windSpeed, rainfall,
    heatRiskScore, heatZone, weatherMain, uvIndex, cityName
  } = input;
  const effectiveTemp = feelsLike ?? temperature;

  // ── HEALTH ADVISORIES ─────────────────────────────────────────────────────

  if (heatRiskScore >= 85) {
    advisories.push({
      domain: "health",
      severity: "critical",
      title: "Extreme Heat Emergency",
      message: `Heatscore of ${heatRiskScore.toFixed(1)}/100 in ${cityName}. Outdoor labor MUST be paused between 12 PM and 4 PM. Keep children and elderly indoors. Ensure access to ORS and drinking water.`,
      trigger: `Heatscore ≥ 85 (actual: ${heatRiskScore.toFixed(1)})`,
      icon: "AlertTriangle"
    });
  } else if (heatRiskScore >= 70) {
    advisories.push({
      domain: "health",
      severity: "alert",
      title: "High Heat Risk — Hydration Alert",
      message: `Heatscore of ${heatRiskScore.toFixed(1)}/100 in ${cityName}. Drink water every 30 minutes if outdoors. Seek shade frequently. Watch for signs of heat exhaustion: dizziness, nausea, rapid heartbeat.`,
      trigger: `Heatscore ≥ 70 (actual: ${heatRiskScore.toFixed(1)})`,
      icon: "Droplets"
    });
  } else if (heatRiskScore >= 50) {
    advisories.push({
      domain: "health",
      severity: "warning",
      title: "Moderate Heat Caution",
      message: `Heatscore of ${heatRiskScore.toFixed(1)}/100 in ${cityName}. Stay hydrated and limit prolonged outdoor exposure during peak hours (11 AM – 3 PM). Use sunscreen and light, breathable clothing.`,
      trigger: `Heatscore ≥ 50 (actual: ${heatRiskScore.toFixed(1)})`,
      icon: "Sun"
    });
  }

  if (effectiveTemp >= 45) {
    advisories.push({
      domain: "health",
      severity: "critical",
      title: "Dangerous Feels-Like Temperature",
      message: `Effective temperature in ${cityName} is ${effectiveTemp.toFixed(1)}°C. Heat stroke risk is very high. Avoid all non-essential outdoor activity.`,
      trigger: `Feels-like ≥ 45°C (actual: ${effectiveTemp.toFixed(1)}°C)`,
      icon: "Thermometer"
    });
  }

  if (humidity >= 80 && temperature >= 35) {
    advisories.push({
      domain: "health",
      severity: "alert",
      title: "High Humidity + Heat Warning",
      message: `${cityName} has ${humidity}% humidity at ${temperature.toFixed(1)}°C. The body's ability to cool through sweat is severely impaired. Heat illness risk is elevated.`,
      trigger: `Humidity ≥ 80% AND Temp ≥ 35°C`,
      icon: "CloudRain"
    });
  }

  // ── AGRICULTURE ADVISORIES ────────────────────────────────────────────────

  if (humidity >= 85 && temperature >= 28) {
    advisories.push({
      domain: "agriculture",
      severity: "warning",
      title: "Crop Disease Risk — High Humidity",
      message: `Humidity of ${humidity}% at ${temperature.toFixed(1)}°C in ${cityName} creates favorable conditions for fungal diseases (blight, mildew). Apply preventive fungicide sprays and monitor crop health closely.`,
      trigger: `Humidity ≥ 85% AND Temp ≥ 28°C`,
      icon: "Leaf"
    });
  }

  if (temperature >= 42) {
    advisories.push({
      domain: "agriculture",
      severity: "alert",
      title: "Crop Heat Stress Alert",
      message: `Temperature of ${temperature.toFixed(1)}°C exceeds crop tolerance thresholds. Irrigate during cooler hours (early morning/late evening). Wheat, rice, and vegetable crops are particularly vulnerable.`,
      trigger: `Temperature ≥ 42°C`,
      icon: "Wheat"
    });
  }

  if ((rainfall ?? 0) > 30) {
    advisories.push({
      domain: "agriculture",
      severity: "warning",
      title: "Heavy Rainfall — Waterlogging Risk",
      message: `Rainfall of ${rainfall?.toFixed(1)}mm detected. Ensure proper drainage in fields. Delay sowing or transplanting activities. Protect stored harvest from moisture damage.`,
      trigger: `Rainfall > 30mm`,
      icon: "CloudRainWind"
    });
  }

  // ── TRAVEL ADVISORIES ─────────────────────────────────────────────────────

  if (windSpeed >= 15) {
    advisories.push({
      domain: "travel",
      severity: "alert",
      title: "High Wind Travel Advisory",
      message: `Wind speeds of ${windSpeed.toFixed(1)} m/s in ${cityName}. Exercise caution on highways and bridges. Avoid two-wheeler travel. Secure loose objects outdoors.`,
      trigger: `Wind ≥ 15 m/s`,
      icon: "Wind"
    });
  } else if (windSpeed >= 10) {
    advisories.push({
      domain: "travel",
      severity: "warning",
      title: "Moderate Wind Advisory",
      message: `Winds of ${windSpeed.toFixed(1)} m/s in ${cityName}. Drive cautiously, especially on elevated roads and open highways.`,
      trigger: `Wind ≥ 10 m/s`,
      icon: "Wind"
    });
  }

  if (weatherMain?.toLowerCase() === "rain" || weatherMain?.toLowerCase() === "thunderstorm") {
    advisories.push({
      domain: "travel",
      severity: "warning",
      title: "Wet Road Conditions",
      message: `Active ${weatherMain?.toLowerCase()} reported in ${cityName}. Roads may be slippery. Reduce speed, increase following distance, and use headlights.`,
      trigger: `Weather: ${weatherMain}`,
      icon: "Car"
    });
  }

  if (weatherMain?.toLowerCase() === "fog" || weatherMain?.toLowerCase() === "mist" || weatherMain?.toLowerCase() === "haze") {
    advisories.push({
      domain: "travel",
      severity: "warning",
      title: "Low Visibility Advisory",
      message: `${weatherMain} conditions in ${cityName}. Visibility may be severely reduced. Use fog lights and avoid overtaking on highways.`,
      trigger: `Weather: ${weatherMain}`,
      icon: "Eye"
    });
  }

  // ── INFRASTRUCTURE ADVISORIES ─────────────────────────────────────────────

  if (temperature >= 42) {
    advisories.push({
      domain: "infrastructure",
      severity: "alert",
      title: "Infrastructure Heat Stress",
      message: `Temperatures of ${temperature.toFixed(1)}°C can cause road surface softening, rail track buckling, and increased power grid load. Authorities should monitor critical infrastructure and prepare for peak electricity demand.`,
      trigger: `Temperature ≥ 42°C`,
      icon: "Building2"
    });
  }

  if ((rainfall ?? 0) > 20) {
    advisories.push({
      domain: "infrastructure",
      severity: "warning",
      title: "Urban Waterlogging Risk",
      message: `Rainfall of ${rainfall?.toFixed(1)}mm may cause waterlogging in low-lying areas of ${cityName}. Storm drains should be inspected. Citizens in flood-prone zones should remain alert.`,
      trigger: `Rainfall > 20mm`,
      icon: "Waves"
    });
  }

  // ── PUBLIC SAFETY ADVISORIES ──────────────────────────────────────────────

  if (heatZone === "extreme") {
    advisories.push({
      domain: "public_safety",
      severity: "critical",
      title: "Extreme Heat Zone — Public Safety Alert",
      message: `${cityName} is classified as an EXTREME heat zone. Municipal cooling centers should be activated. Public water stations should be deployed. Outdoor events and gatherings should be postponed.`,
      trigger: `Heat Zone: Extreme`,
      icon: "ShieldAlert"
    });
  }

  if (uvIndex !== undefined && uvIndex >= 8) {
    advisories.push({
      domain: "public_safety",
      severity: "alert",
      title: "Very High UV Exposure",
      message: `UV Index of ${uvIndex} — very high radiation risk. Avoid direct sun exposure between 10 AM and 4 PM. Apply SPF 30+ sunscreen. Wear protective clothing and sunglasses.`,
      trigger: `UV Index ≥ 8`,
      icon: "Sun"
    });
  }

  // ── POSITIVE / LOW-RISK INFO ──────────────────────────────────────────────

  if (advisories.length === 0) {
    advisories.push({
      domain: "health",
      severity: "info",
      title: "Comfortable Conditions",
      message: `Current conditions in ${cityName} are within safe ranges. No significant weather advisories at this time. Enjoy your day! 🌤️`,
      trigger: "All parameters within safe thresholds",
      icon: "CheckCircle"
    });
  }

  return advisories;
}

/**
 * Get the highest severity from a list of advisories
 */
export function getOverallSeverity(advisories: Advisory[]): Advisory["severity"] {
  if (advisories.some(a => a.severity === "critical")) return "critical";
  if (advisories.some(a => a.severity === "alert")) return "alert";
  if (advisories.some(a => a.severity === "warning")) return "warning";
  return "info";
}
