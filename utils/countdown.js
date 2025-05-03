// utils/countdown.js
const { DateTime } = require('luxon');
const { EmbedBuilder } = require('discord.js');

const target = DateTime.fromObject({
  year: 2025,
  month: 6,
  day: 18,
  hour: 12,
  minute: 0,
}, { zone: 'America/New_York' });

function getCountdownMessage() {
  const now = DateTime.now().setZone('America/New_York');
  if (now >= target) return null;

  const diff = target.diff(now, ['days']).toObject();
  const days = Math.floor(diff.days);

  return new EmbedBuilder()
    .setTitle('📆 Countdown To Campers')
    .setDescription(`Today is **${now.toFormat('MMMM d, yyyy')}**\n\nThere are **${days} day${days !== 1 ? 's' : ''}** until the campers arrive!`)
    .setColor(0x00bfff)
    .setTimestamp();
}

function getFinalMessage() {
  return `@everyone 🎉 **WELCOME CAMPERS! GOOD LUCK STAFF!** 🎉`;
}

module.exports = { getCountdownMessage, getFinalMessage };
