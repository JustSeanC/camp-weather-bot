const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const { fetchCurrentMeteo } = require('../utils/fetchCurrentMeteo');

function weatherCodeToText(code) {
  const map = {
    0: ['Clear', '☀️'], 1: ['Mainly Clear', '🌤️'], 2: ['Partly Cloudy', '⛅'],
    3: ['Overcast', '☁️'], 45: ['Fog', '🌫️'], 48: ['Rime Fog', '🌫️'],
    51: ['Light Drizzle', '🌦️'], 53: ['Moderate Drizzle', '🌧️'], 55: ['Dense Drizzle', '🌧️'],
    56: ['Freezing Drizzle', '🌧️❄️'], 57: ['Heavy Freezing Drizzle', '🌧️❄️'],
    61: ['Light Rain', '🌧️'], 63: ['Moderate Rain', '🌧️'], 65: ['Heavy Rain', '🌧️'],
    66: ['Freezing Rain', '🌧️❄️'], 67: ['Heavy Freezing Rain', '🌧️❄️'],
    71: ['Light Snow', '🌨️'], 73: ['Moderate Snow', '❄️'], 75: ['Heavy Snow', '❄️'],
    80: ['Light Showers', '🌦️'], 81: ['Moderate Showers', '🌧️'], 82: ['Violent Showers', '🌧️⚠️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + Hail', '⛈️❄️'], 99: ['Severe Thunderstorm', '⛈️⚠️']
  };
  return map[code] || ['Unknown', '❓'];
}
function degreesToCardinal(deg) {
    const directions = [
      'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
      'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'
    ];
    const index = Math.round(deg / 22.5) % 16;
    return directions[index];
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

    const data = await fetchCurrentMeteo();
    if (!data) return interaction.reply('⚠️ Weather data unavailable.');

    const dt = DateTime.fromISO(data.time, { zone: timezone }).toFormat('h:mm a');
    const [desc, emoji] = weatherCodeToText(data.weatherCode);

    const temp = isMetric ? `${((data.temperature - 32) * 5 / 9).toFixed(1)}°C` : `${data.temperature.toFixed(1)}°F`;
    const feels = isMetric ? `${((data.feelsLike - 32) * 5 / 9).toFixed(1)}°C` : `${data.feelsLike.toFixed(1)}°F`;
    const wind = isMetric ? `${(data.windSpeed * 1.60934).toFixed(1)} km/h` : `${data.windSpeed.toFixed(1)} mph`;
    const gust = isMetric ? `${(data.windGust * 1.60934).toFixed(1)} km/h` : `${data.windGust.toFixed(1)} mph`;
    const precip = isMetric ? `${(data.precip * 25.4).toFixed(1)} mm` : `${data.precip.toFixed(2)} in`;

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Current Weather`)
      .setDescription(`As of ${dt} (${timezone})`)
      .addFields(
        { name: 'Temperature', value: temp, inline: true },
        { name: 'Feels Like', value: feels, inline: true },
        { name: 'Humidity', value: `${Math.round(data.humidity)}%`, inline: true },
        { name: 'Precipitation', value: precip, inline: true },
        { name: 'Wind', value: `${wind} from ${degreesToCardinal(data.windDir)}`, inline: true },
        { name: 'Gusts', value: gust, inline: true },
        { name: 'Condition', value: desc, inline: false }
      )      
      .setFooter({ text: 'Data from Open-Meteo' })
      .setColor(0x0077be)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
