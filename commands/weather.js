// commands/weather.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const { fetchOpenMeteoData } = require('../utils/fetchOpenMeteo');

function summarizeSky(cloudCover) {
  if (cloudCover < 10) return 'Clear';
  if (cloudCover < 40) return 'Mostly Sunny';
  if (cloudCover < 70) return 'Partly Cloudy';
  if (cloudCover < 90) return 'Cloudy';
  return 'Overcast';
}

function cToF(c) {
  return ((c * 9) / 5 + 32).toFixed(1);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('weather')
    .setDescription('Shows current weather at camp'),

  async execute(interaction) {
    const timezone = process.env.TIMEZONE || 'America/New_York';
    const lat = parseFloat(process.env.LAT);
    const lng = parseFloat(process.env.LNG);

    const now = DateTime.now().toUTC().toISO();
    const future = DateTime.now().plus({ hours: 1 }).toUTC().toISO();

    try {
      const forecast = await fetchOpenMeteoData(now, future);
      if (!forecast.length) return interaction.reply('⚠️ Weather data unavailable.');

      const h = forecast[0];
      const time = DateTime.fromISO(h.time, { zone: timezone }).toFormat('h:mm a');
      const tempF = cToF(h.temperature);
      const feelsF = cToF(h.feelsLike);
      const humidity = h.humidity;
      const wind = h.windSpeed.toFixed(1);
      const windDir = h.windDirection;
      const sky = summarizeSky(h.cloudCover);

      const embed = new EmbedBuilder()
        .setTitle('🌤️ Current Weather')
        .setDescription(`As of ${time} (${timezone})`)
        .addFields(
          { name: 'Temperature', value: `${tempF}°F`, inline: true },
          { name: 'Feels Like', value: `${feelsF}°F`, inline: true },
          { name: 'Humidity', value: `${humidity}%`, inline: true },
          { name: 'Wind', value: `${wind} mph @ ${windDir}°`, inline: true },
          { name: 'Sky Condition', value: sky, inline: true }
        )
        .setColor(0x0077be)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (err) {
      console.error('[❌] /weather command error:', err);
      await interaction.reply('❌ Failed to fetch weather data.');
    }
  },
};