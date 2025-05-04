const fetch = require('node-fetch');
const { DateTime } = require('luxon');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

async function fetchOpenMeteoData(startISO, endISO) {
  const baseUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${timezone}`;
  const hourlyParams = 'temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m';

  let url = `${baseUrl}&hourly=${hourlyParams}`;

  const includeCurrent = !startISO && !endISO;
  if (includeCurrent) url += `&current_weather=true`;

  if (startISO && endISO) {
    const startDate = DateTime.fromISO(startISO).toISODate();
    const endDate = DateTime.fromISO(endISO).toISODate();
    url += `&start_date=${startDate}&end_date=${endDate}`;
  }

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data?.hourly?.time || !Array.isArray(data.hourly.time)) {
      console.warn('[⚠️] Open-Meteo response malformed:', data);
      return [];
    }

    // ➤ Return full hourly data for forecast blocks
    if (startISO && endISO) {
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
    }

    // ➤ Return single current weather object for /weather
    if (!data.current_weather) {
      console.warn('[⚠️] Missing current weather data.');
      return [];
    }

    const currentTime = DateTime.fromISO(data.current_weather.time);
    let bestMatchIndex = -1;
    let smallestDiff = Infinity;

    data.hourly.time.forEach((t, i) => {
      const diff = Math.abs(DateTime.fromISO(t).diff(currentTime).as('minutes'));
      if (diff < smallestDiff) {
        smallestDiff = diff;
        bestMatchIndex = i;
      }
    });

    return [{
      time: currentTime.toISO(),
      temperature: data.current_weather.temperature,
      windSpeed: data.current_weather.windspeed,
      windDir: data.current_weather.winddirection,
      weatherCode: data.current_weather.weathercode,
      humidity: data.hourly.relative_humidity_2m[bestMatchIndex] ?? null,
      feelsLike: data.hourly.apparent_temperature[bestMatchIndex] ?? null,
      dewPoint: data.hourly.dew_point_2m[bestMatchIndex] ?? null,
      precipProb: data.hourly.precipitation_probability[bestMatchIndex] ?? null,
      precip: data.hourly.precipitation[bestMatchIndex] ?? null,
      cloudCover: data.hourly.cloud_cover[bestMatchIndex] ?? null,
      windGust: data.hourly.wind_gusts_10m[bestMatchIndex] ?? null
    }];
  } catch (err) {
    console.error('[❌] Open-Meteo fetch failed:', err);
    return [];
  }
}

module.exports = { fetchOpenMeteoData };
