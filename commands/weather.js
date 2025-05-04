const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const { fetchOpenMeteoData } = require('../utils/fetchOpenMeteo');

function weatherCodeToText(code) {
  const map = {
    0: ['Clear', '☀️'],
    1: ['Mainly Clear', '🌤️'],
    2: ['Partly Cloudy', '⛅'],
    3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'],
    48: ['Rime Fog', '🌫️'],
    51: ['Light Drizzle', '🌦️'],
    53: ['Moderate Drizzle', '🌧️'],
    55: ['Dense Drizzle', '🌧️'],
    56: ['Freezing Drizzle', '🌧️❄️'],
    57: ['Heavy Freezing Drizzle', '🌧️❄️'],
    61: ['Light Rain', '🌧️'],
    63: ['Moderate Rain', '🌧️'],
    65: ['Heavy Rain', '🌧️'],
    66: ['Freezing Rain', '🌧️❄️'],
    67: ['Heavy Freezing Rain', '🌧️❄️'],
    71: ['Light Snow', '🌨️'],
    73: ['Moderate Snow', '❄️'],
    75: ['Heavy Snow', '❄️'],
    80: ['Light Showers', '🌦️'],
    81: ['Moderate Showers', '🌧️'],
    82: ['Violent Showers', '🌧️⚠️'],
    95: ['Thunderstorm', '⛈️'],
    96: ['Thunderstorm + Hail', '⛈️❄️'],
    99: ['Severe Thunderstorm', '⛈️⚠️']
  };
  return map[code] || ['Unknown', '❓'];
}

function summarizeSky(cloudCover) {
  if (cloudCover < 10) return 'Clear';
  if (cloudCover < 40) return 'Mostly Sunny';
  if (cloudCover < 70) return 'Partly Cloudy';
  if (cloudCover < 90) return 'Cloudy';
  return 'Overcast';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Shows current weather at camp')
    .addStringOption(option =>
      option.setName('units')
        .setDescription('Select unit system')
        .setRequired(true)
        .addChoices(
          { name: 'Imperial (°F, mph)', value: 'imperial' },
          { name: 'Metric (°C, km/h)', value: 'metric' }
        )
    ),

  async execute(interaction) {
    const units = interaction.options.getString('units');
    const isMetric = units === 'metric';
    const timezone = process.env.TIMEZONE || 'America/New_York';
    const lat = parseFloat(process.env.LAT);
    const lng = parseFloat(process.env.LNG);

    const now = DateTime.now().toUTC().toISO();
    const future = DateTime.now().plus({ hours: 1 }).toUTC().toISO();

    try {
      const forecast = await fetchOpenMeteoData(now, future);
      if (!forecast.length) return interaction.reply('⚠️ Weather data unavailable.');

      const h = forecast[0];
      const localTime = DateTime.fromISO(h.time).setZone(timezone).toFormat('h:mm a');

      const tempC = typeof h.temperature === 'number' ? h.temperature : null;
      const feelsC = typeof h.feelsLike === 'number' ? h.feelsLike : tempC;
      const humidity = typeof h.humidity === 'number' ? `${Math.round(h.humidity)}%` : 'N/A';
      const windSpeed = typeof h.windSpeed === 'number' ? h.windSpeed : 0;
      const windGust = typeof h.windGust === 'number' ? h.windGust : 0;
      const windDir = typeof h.windDirection === 'number' ? `${Math.round(h.windDirection)}°` : 'N/A';
      const precipitation = typeof h.precipitation === 'number' ? h.precipitation : 0;
      const cloudCover = typeof h.cloudCover === 'number' ? h.cloudCover : 0;
      const [conditionText, emoji] = weatherCodeToText(h.weathercode ?? -1);

      const temp = tempC !== null
        ? isMetric ? `${Math.round(tempC)}°C` : `${Math.round(tempC * 9 / 5 + 32)}°F`
        : 'N/A';

      const feels = feelsC !== null
        ? isMetric ? `${Math.round(feelsC)}°C` : `${Math.round(feelsC * 9 / 5 + 32)}°F`
        : 'N/A';

      const wind = isMetric
        ? `${(windSpeed * 3.6).toFixed(1)} km/h @ ${windDir}`
        : `${windSpeed.toFixed(1)} mph @ ${windDir}`;

      const gusts = isMetric
        ? `${(windGust * 3.6).toFixed(1)} km/h`
        : `${windGust.toFixed(1)} mph`;

      const precip = isMetric
        ? `${precipitation.toFixed(1)} mm`
        : `${(precipitation / 25.4).toFixed(2)} in`;

      const sky = summarizeSky(cloudCover);

      const embed = new EmbedBuilder()
        .setTitle(`${emoji} Current Weather`)
        .setDescription(`As of ${localTime} (${timezone})`)
        .addFields(
          { name: 'Temperature', value: temp, inline: true },
          { name: 'Feels Like', value: feels, inline: true },
          { name: 'Humidity', value: humidity, inline: true },
          { name: 'Precipitation', value: precip, inline: true },
          { name: 'Wind', value: wind, inline: true },
          { name: 'Gusts', value: gusts, inline: true },
          { name: 'Sky Condition', value: `${conditionText} (${sky})`, inline: false }
        )
        .setColor(0x0077be)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[❌] /weather command error:', err);
      await interaction.reply('❌ Failed to fetch weather data.');
    }
  }
};
