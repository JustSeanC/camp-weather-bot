const fetch = require('node-fetch');
const { DateTime } = require('luxon');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

function getOpenMeteoForecastHours(currentHour) {
  if (currentHour < 7) return 7 - currentHour;
  if (currentHour < 12) return 12 - currentHour;
  if (currentHour < 17) return 17 - currentHour;
  return 24 - currentHour + 7;
}

async function fetchOpenMeteoData() {
  const localNow = DateTime.now().setZone(timezone);
  const forecastHours = getOpenMeteoForecastHours(localNow.hour);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&forecast_hours=${forecastHours}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${timezone}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data?.hourly?.time || !Array.isArray(data.hourly.time)) {
      console.warn('[⚠️] Open-Meteo response malformed:', data);
      return null;
    }

    return data.hourly.time.map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i] ?? null,
      humidity: data.hourly.relative_humidity_2m[i] ?? null,
      feelsLike: data.hourly.apparent_temperature[i] ?? null,
      dewPoint: data.hourly.dew_point_2m[i] ?? null,
      precipProb: data.hourly.precipitation_probability[i] ?? null,
      precip: data.hourly.precipitation[i] ?? null,
      weatherCode: data.hourly.weather_code[i] ?? null,
      cloudCover: data.hourly.cloud_cover[i] ?? null,
      windSpeed: data.hourly.wind_speed_10m[i] ?? null,
      windDir: data.hourly.wind_direction_10m[i] ?? null,
      windGust: data.hourly.wind_gusts_10m[i] ?? null
    }));
  } catch (err) {
    console.error('[❌] Open-Meteo fetch failed:', err);
    return null;
  }
}

module.exports = { fetchOpenMeteoData };
