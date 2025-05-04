// utils/fetchCurrentMeteo.js
const fetch = require('node-fetch');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

async function fetchCurrentMeteo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_gusts_10m,wind_direction_10m,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${timezone}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.current) {
      console.warn('[⚠️] Open-Meteo current data missing or malformed:', data);
      return null;
    }

    return {
      time: data.current.time,
      temperature: data.current.temperature_2m ?? null,
      humidity: data.current.relative_humidity_2m ?? null,
      feelsLike: data.current.apparent_temperature ?? null,
      isDay: data.current.is_day,
      precip: data.current.precipitation ?? null,
      rain: data.current.rain ?? null,
      showers: data.current.showers ?? null,
      weatherCode: data.current.weather_code ?? null,
      cloudCover: data.current.cloud_cover ?? null,
      windSpeed: data.current.wind_speed_10m ?? null,
      windDir: data.current.wind_direction_10m ?? null,
      windGust: data.current.wind_gusts_10m ?? null
    };
  } catch (err) {
    console.error('[❌] fetchCurrentMeteo failed:', err);
    return null;
  }
}

module.exports = { fetchCurrentMeteo };
