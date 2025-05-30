const { EmbedBuilder, Events } = require('discord.js');
require('dotenv').config();
const rideStore = require('../data/rideStore');

module.exports = {
  name: Events.MessageReactionAdd,

  async execute(reaction, user) {
    if (user.bot) return;
    if (reaction.emoji.name !== '🚗') return;

    const ride = rideStore.getRide(reaction.message.id);
    if (!ride) return;

    // Already full or user already in ride
    if (ride.riders.length >= ride.totalSeats || ride.riders.includes(user.id)) return;

    const guild = reaction.message.guild;
    const channel = reaction.message.channel;
    const driver = await guild.members.fetch(ride.driverId);
    const rider = await guild.members.fetch(user.id);
    const overviewRole = guild.roles.cache.get(process.env.OVERVIEW_ROLE_ID);

    let thread;

    // Create thread if needed
    if (!ride.threadId) {
      thread = await reaction.message.startThread({
        name: `Ride Match: ${driver.displayName}`,
        autoArchiveDuration: 10080, // 7 days (max)
        type: 12, // Private thread
        reason: `Ride offer thread for ${ride.driverId}`
      });

      // Save thread ID
ride.threadId = thread.id;
rideStore.addRide(reaction.message.id, ride); // <--- ADD THIS LINE

      // Add overview role + driver
      await thread.members.add(driver.id);
      if (overviewRole) await thread.members.add(overviewRole.id);
    } else {
        thread = await reaction.message.guild.channels.fetch(ride.threadId).catch(() => null);
    }

    if (!thread) return;

    // Add rider to thread
    await thread.members.add(rider.id);

    // Post intro message in thread
    await thread.send(`👋 <@${ride.driverId}> and <@${user.id}>, you've been connected for a ride **${ride.direction}** at **${ride.departure}**.`);

    // Update internal ride state
    ride.riders.push(user.id);

    // Update embed with new seat count
    const embed = EmbedBuilder.from(reaction.message.embeds[0]);
    const newSeats = ride.totalSeats - ride.riders.length;

    embed.spliceFields(2, 1, { name: 'Seats Available', value: `${newSeats}`, inline: true });

    if (newSeats === 0) {
        embed.setColor('Red');
      
        // Replace Join This Ride field
        const fields = embed.data.fields || [];
        const joinIndex = fields.findIndex(f => f.name === 'Join This Ride');
        if (joinIndex !== -1) {
          embed.spliceFields(joinIndex, 1, { name: 'Status', value: '🔒 Ride Full' });
        } else {
          embed.addFields({ name: 'Status', value: '🔒 Ride Full' });
        }
      }
      

    await reaction.message.edit({ embeds: [embed] });
  }
};
