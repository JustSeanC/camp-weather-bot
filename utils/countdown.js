// utils/countdown.js
const { DateTime } = require('luxon');

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

  const diff = target.diff(now, ['days', 'hours', 'minutes']).toObject();
  const days = Math.floor(diff.days);
  const hours = Math.floor(diff.hours);
  const minutes = Math.floor(diff.minutes);

  return `🎉 **Countdown to Campers:** ${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} remaining!`;
}

function getFinalMessage() {
    return `@everyone 🎉 **WELCOME CAMPERS! GOOD LUCK STAFF!** 🎉`;
  }
  

module.exports = { getCountdownMessage, getFinalMessage };
