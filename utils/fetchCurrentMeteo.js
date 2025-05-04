// utils/fetchCurrentMeteo.js
const fetch = require('node-fetch');
const { DateTime } = require('luxon');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

async function fetchCurrentMeteo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=apparent_temperature,relative_humidity_2m,precipitation,precipitation_probability,dew_point_2m,cloud_cover,wind_gusts_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${timezone}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.current_weather || !data.hourly?.time) return null;

    const currentTime = data.current_weather.time;
    const index = data.hourly.time.findIndex(t => t === currentTime);
    if (index === -1) return null;

    return {
      time: currentTime,
      temperature: data.current_weather.temperature,
      windSpeed: data.current_weather.windspeed,
      windDir: data.current_weather.winddirection,
      weatherCode: data.current_weather.weathercode,
      feelsLike: data.hourly.apparent_temperature[index],
      humidity: data.hourly.relative_humidity_2m[index],
      dewPoint: data.hourly.dew_point_2m[index],
      precip: data.hourly.precipitation[index],
      precipProb: data.hourly.precipitation_probability[index],
      cloudCover: data.hourly.cloud_cover[index],
      windGust: data.hourly.wind_gusts_10m[index]
    };
  } catch (err) {
    console.error('[❌] Failed to fetch current weather:', err);
    return null;
  }
}

module.exports = { fetchCurrentMeteo };
