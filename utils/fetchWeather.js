require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const apiKey = process.env.STORMGLASS_API_KEY;
const timezone = process.env.TIMEZONE || 'America/New_York';

const weatherParams = [
  'airTemperature',
  'windSpeed',
  'windDirection',
  'cloudCover',
  'waveHeight',
  'waterTemperature'
];


const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;

function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function mpsToMph(ms) {
  return (ms * 2.23694).toFixed(1);
}

function metersToFeet(m) {
  return (m * 3.28084).toFixed(1);
}

function cToF(c) {
  return ((c * 9) / 5 + 32).toFixed(1);
}

function getNextForecastTime() {
  const now = new Date();

  // Get current hour in NY timezone explicitly
  const localHour = parseInt(now.toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone
  }));

  let nextHour;
  if (localHour < 7) nextHour = 7;
  else if (localHour < 12) nextHour = 12;
  else if (localHour < 17) nextHour = 17;
  else nextHour = 7; // next morning

  const nextDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  nextDate.setHours(nextHour, 0, 0, 0);
  if (nextHour === 7 && localHour >= 17) nextDate.setDate(nextDate.getDate() + 1);

  const local = nextDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const utc = nextDate.toUTCString().match(/\d{2}:\d{2}/)[0];

  return `**${local} ${timezone} / ${utc} UTC**`;
}


function getMoonEmoji(phase) {
  const map = {
    'New Moon': '🌑',
    'Waxing Crescent': '🌒',
    'First Quarter': '🌓',
    'Waxing Gibbous': '🌔',
    'Full Moon': '🌕',
    'Waning Gibbous': '🌖',
    'Last Quarter': '🌗',
    'Waning Crescent': '🌘',
  };
  return map[phase] || '🌙';
}

function getGreetingEmoji(hour) {
  if (hour < 12) return '🌅 Good Morning';
  if (hour < 17) return '🌞 Good Afternoon';
  return '🌇 Good Evening';
}

async function fetchForecastEmbed() {
  const headers = { Authorization: apiKey };
  const [forecastRes, tideRes, astronomyRes] = await Promise.all([
    fetch(forecastEndpoint, { headers }).then(r => r.json()),
    fetch(tideEndpoint, { headers }).then(r => r.json()),
    fetch(astronomyEndpoint, { headers }).then(r => r.json()),
  ]);

  const now = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));

  let startHour, endHour;
  if (localHour < 7) {
    startHour = 5;
    endHour = 7;
  } else if (localHour < 12) {
    startHour = 7;
    endHour = 12;
  } else if (localHour < 17) {
    startHour = 12;
    endHour = 17;
  } else {
    startHour = 17;
    endHour = 7; // next day
  }

  const forecastWindow = forecastRes.hours.filter(h => {
    const hour = new Date(h.time).getHours();
    if (startHour < endHour) return hour >= startHour && hour < endHour;
    return hour >= startHour || hour < endHour;
  });

  if (forecastWindow.length === 0) {
    throw new Error("No forecast data for current window");
  }

  const tempsF = forecastWindow.map(h => cToF(h.airTemperature?.noaa ?? 0));
  const winds = forecastWindow.map(h => h.windSpeed?.noaa ?? 0);
  const waveHeights = forecastWindow.map(h => h.waveHeight?.noaa ?? 0);
  const clouds = forecastWindow.map(h => h.cloudCover?.noaa ?? 0);
  const weatherTypes = clouds.map(c => {
    if (c < 10) return 'Clear';
    if (c < 40) return 'Mostly Sunny';
    if (c < 70) return 'Partly Cloudy';
    if (c < 90) return 'Cloudy';
    return 'Overcast';
  });
  const waterTempC = forecastWindow[0].waterTemperature?.noaa ?? 'N/A';
  const waterTempF = waterTempC !== 'N/A' ? cToF(waterTempC) : 'N/A';
  const windDirs = forecastWindow.map(h => h.windDirection?.noaa ?? 0);
  const windAvgDir = windDirs.reduce((a, b) => a + b, 0) / windDirs.length;
  const tempMin = Math.min(...tempsF);
  const tempMax = Math.max(...tempsF);
  const windMin = Math.min(...winds);
  const windMax = Math.max(...winds);
  const waveMin = Math.min(...waveHeights);
  const waveMax = Math.max(...waveHeights);
  const cloudMin = Math.min(...clouds);
  const cloudMax = Math.max(...clouds);

  const waveAlert = waveMax >= 1.22;
  const windAlert = windMax >= 8.05;
  const showAdvisory = waveAlert || windAlert;

const astro = astronomyRes.data[0];
 const sunrise = new Date(astro.sunrise).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
const sunset = new Date(astro.sunset).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
const moonPhase = astro.moonPhase?.current?.text || 'Unknown';

  const moonEmoji = getMoonEmoji(moonPhase);

  const greeting = getGreetingEmoji(localHour);
  const dateString = now.toLocaleDateString();
  const localTime = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const utcTime = now.toUTCString().match(/\d{2}:\d{2}/)[0];

  const tideSummary = tideRes.data.slice(0, 4).map(t => {
    const time = new Date(t.time).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: timezone,
    });
    return `${t.type} at ${time}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast`)
    .addFields(
      { name: 'Date', value: dateString, inline: true },
      { name: 'Time', value: `${localTime} EDT / ${utcTime} UTC`, inline: true },
      { name: 'Greeting', value: greeting, inline: true },
      { name: 'Forecast Window', value: `${startHour}:00 → ${endHour === 7 ? '07:00 (next day)' : `${endHour}:00`} EDT`, inline: false },
      { name: 'Temperature', value: `${((tempMin - 32) * 5 / 9).toFixed(1)}°C / ${tempMin}°F → ${((tempMax - 32) * 5 / 9).toFixed(1)}°C / ${tempMax}°F`, inline: true },
      { name: 'Wind', value: `${windMin.toFixed(1)} m/s / ${mpsToMph(windMin)} mph → ${windMax.toFixed(1)} m/s / ${mpsToMph(windMax)} mph\nDirection: ${degreesToCompass(windAvgDir)} avg`, inline: true },
      { name: 'Cloud Cover', value: `${cloudMin}% → ${cloudMax}%`, inline: true },
      { name: 'Sky Conditions', value: [...new Set(weatherTypes)].join(', '), inline: true },
      { name: 'Wave Height', value: `${waveMin.toFixed(2)} m / ${metersToFeet(waveMin)} ft → ${waveMax.toFixed(2)} m / ${metersToFeet(waveMax)} ft`, inline: true },
      { name: 'Water Temp', value: `${waterTempC}°C / ${waterTempF}°F`, inline: true },
      { name: 'Tides', value: tideSummary || 'No data', inline: false },
      { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: false },
      { name: 'Moon Phase', value: `${moonEmoji} ${moonPhase}`, inline: false },
      { name: 'Next Forecast', value: getNextForecastTime(), inline: false },
      ...(showAdvisory ? [
        {
          name: '⚠️ Marine Advisory Forecast',
          value: 'Potential for Small Craft Advisory.\nConditions may be hazardous — use caution.',
          inline: false
        }
      ] : [])
    )
    .setFooter({ text: 'Forecast data from Storm Glass. Advisory logic is estimated.' })
    .setColor(showAdvisory ? 0xffa500 : 0x00ff00)
    .setTimestamp();

  return embed;
}
module.exports = { fetchForecastEmbed };
