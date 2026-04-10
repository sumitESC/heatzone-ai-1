const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const ONECALL_URL = "https://api.openweathermap.org/data/3.0/onecall";

export async function fetchOneCall3(lat: number, lon: number): Promise<any | null> {
  if (!OPENWEATHER_API_KEY) {
    console.warn("OPENWEATHER_API_KEY not set, One Call API 3.0 restricted.");
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const url = `${ONECALL_URL}?lat=${lat}&lon=${lon}&exclude=minutely&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`OneCall API error for lat=${lat}, lon=${lon}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`Failed to fetch OneCall for lat=${lat}, lon=${lon}:`, err);
    return null;
  }
}
