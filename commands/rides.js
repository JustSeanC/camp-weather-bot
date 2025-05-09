// Final cleaned-up and corrected rides.js
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const rideStore = require('../data/rideStore');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rides')
    .setDescription('Manage ride board')
    .addSubcommand(sub =>
      sub.setName('offer')
        .setDescription('Offer a ride to/from camp or town')
        .addStringOption(opt => opt.setName('to').setDescription('Destination').setRequired(true))
        .addStringOption(opt => opt.setName('departure_date').setDescription('Date (e.g., Sat 6/15)').setRequired(true))
        .addStringOption(opt => opt.setName('departure_time').setDescription('Time (e.g., 2:30 PM)').setRequired(true))
        .addStringOption(opt => opt.setName('meeting_location').setDescription('Meeting location').setRequired(true))
        .addIntegerOption(opt => opt.setName('seats').setDescription('Seats available').setRequired(true).addChoices(...Array.from({ length: 8 }, (_, i) => ({ name: `${i + 1}`, value: i + 1 }))))
        .addIntegerOption(opt => opt.setName('expires_in').setDescription('Expires in').setRequired(true).addChoices(...Array.from({ length: 14 }, (_, i) => ({ name: `${i + 1} day${i + 1 > 1 ? 's' : ''}`, value: i + 1 }))))
        .addStringOption(opt => opt.setName('notes').setDescription('Optional notes').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close a posted ride early')
        .addStringOption(opt => opt.setName('message_id').setDescription('Message ID or Ride ID').setRequired(false))
    )
    .addSubcommand(sub =>
      sub.setName('reopen')
        .setDescription('Re-open a closed or expired ride (run in ride thread)')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'offer') {
      const destination = interaction.options.getString('to');
      const date = interaction.options.getString('departure_date');
      const time = interaction.options.getString('departure_time');
      const departure = `${date} at ${time}`;

      if (!/\d{1,2}(:\d{2})?\s?(AM|PM)/i.test(time)) {
        return interaction.reply({ content: '❌ Invalid time format. Try `2:30 PM`.', ephemeral: true });
      }

      const meetingLocation = interaction.options.getString('meeting_location');
      const seats = interaction.options.getInteger('seats');
      const notes = interaction.options.getString('notes') || 'None';
      const expiresAt = Date.now() + interaction.options.getInteger('expires_in') * 86400000;
      const expirationText = `<t:${Math.floor(expiresAt / 1000)}:F>`;
      const rideId = uuidv4().slice(0, 6);
      const rideChannel = interaction.client.channels.cache.get(process.env.RIDE_CHANNEL_ID);

      if (!rideChannel) {
        return interaction.reply({ content: '❌ RIDE_CHANNEL_ID not found.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🚗 Ride Offer')
        .addFields(
          { name: 'Destination', value: destination, inline: true },
          { name: 'Departure Time', value: departure, inline: true },
          { name: 'Meeting Location', value: meetingLocation, inline: true },
          { name: 'Seats Available', value: `${seats}`, inline: true },
          { name: 'Notes', value: notes },
          { name: 'Posted by', value: `<@${interaction.user.id}>` },
          { name: '⏳ Expires', value: expirationText },
          { name: 'Join This Ride', value: 'React with 🚗 to join this ride.', inline: false }
        )
        .setFooter({ text: `Ride ID: ${rideId}` })
        .setColor('Green')
        .setTimestamp();

      try {
        const message = await rideChannel.send({ embeds: [embed] });
        await message.react('🚗');

        rideStore.addRide(message.id, {
          rideId,
          messageId: message.id,
          channelId: rideChannel.id,
          threadId: null,
          driverId: interaction.user.id,
          departure,
          destination,
          meetingLocation,
          totalSeats: seats,
          riders: [],
          expiresAt,
        });

        await interaction.reply({ content: '✅ Ride posted!', ephemeral: true });
      } catch (err) {
        console.error(err);
        await interaction.reply({ content: '❌ Error posting ride.', ephemeral: true });
      }
    } else if (sub === 'close') {
      const messageId = interaction.options.getString('message_id');
      const isInThread = interaction.channel.isThread();
      let ride = messageId ? rideStore.getRide(messageId) : null;

      if (!ride && isInThread) {
        const threadId = interaction.channel.id;
        ride = Object.values(rideStore.getAllRides()).find(r => r.threadId === threadId);
      }

      if (!ride) {
        return interaction.reply({ content: '❌ Ride not found.', ephemeral: true });
      }

      const isOwner = ride.driverId === interaction.user.id;
      const isOverview = interaction.member.roles.cache.has(process.env.OVERVIEW_ROLE_ID);

      if (!isOwner && !isOverview) {
        return interaction.reply({ content: '❌ You do not have permission to close this ride.', ephemeral: true });
      }

      try {
        const channel = await interaction.client.channels.fetch(ride.channelId);
        const message = await channel.messages.fetch(ride.messageId);
        const embed = EmbedBuilder.from(message.embeds[0]);

        const joinIndex = embed.data.fields.findIndex(f => f.name === 'Join This Ride');
        if (joinIndex !== -1) {
          embed.spliceFields(joinIndex, 1, { name: 'Status', value: '🔒 Closed Early' });
        } else {
          embed.addFields({ name: 'Status', value: '🔒 Closed Early' });
        }
        embed.setColor('Red');
        await message.edit({ embeds: [embed] });
        await message.reactions.removeAll();
        rideStore.removeRide(ride.messageId);

        return interaction.reply({ content: '✅ Ride closed.', ephemeral: true });
      } catch (err) {
        console.error(err);
        return interaction.reply({ content: '❌ Could not close the ride.', ephemeral: true });
      }
    } else if (sub === 'reopen') {
      if (!interaction.channel.isThread()) {
        return interaction.reply({ content: '❌ Use this inside a ride thread.', ephemeral: true });
      }

      const threadId = interaction.channel.id;
      let ride = Object.values(rideStore.getAllRides()).find(r => r.threadId === threadId);

      if (!ride) {
        const expiredPath = path.join(__dirname, '../data/rides_expired.json');
        if (fs.existsSync(expiredPath)) {
          try {
            const expiredRides = JSON.parse(fs.readFileSync(expiredPath, 'utf8'));
            ride = Object.values(expiredRides).find(r => r.threadId === threadId);
            if (ride) {
              console.log(`♻️ Restoring expired ride ${ride.rideId}`);
              rideStore.addRide(ride.messageId, ride);
              delete expiredRides[ride.messageId];
              fs.writeFileSync(expiredPath, JSON.stringify(expiredRides, null, 2));
            }
          } catch (err) {
            console.warn('⚠️ Failed to load expired rides:', err.message);
          }
        }
      }

      if (!ride) {
        return interaction.reply({ content: '❌ Ride not found in expired or active list.', ephemeral: true });
      }

      if (ride.driverId !== interaction.user.id) {
        return interaction.reply({ content: '❌ Only the original driver can reopen this ride.', ephemeral: true });
      }

      try {
        const channel = await interaction.client.channels.fetch(ride.channelId);
        const message = await channel.messages.fetch(ride.messageId);
        const embed = EmbedBuilder.from(message.embeds[0]);

        const statusIndex = embed.data.fields.findIndex(f => f.name === 'Status');
        if (statusIndex !== -1) {
          embed.spliceFields(statusIndex, 1, {
            name: 'Join This Ride',
            value: 'React with 🚗 to be added to this ride thread.',
            inline: false
          });
        } else {
          embed.addFields({
            name: 'Join This Ride',
            value: 'React with 🚗 to be added to this ride thread.',
            inline: false
          });
        }

        embed.setColor('Green');
        await message.edit({ embeds: [embed] });
        await message.react('🚗');

        return interaction.reply({ content: '✅ Ride re-opened!', ephemeral: true });
      } catch (err) {
        console.error('❌ Error reopening ride:', err);
        return interaction.reply({ content: '⚠️ Could not reopen the ride.', ephemeral: true });
      }
    }
  },

  getRideStore() {
    return rideStore;
  }
};