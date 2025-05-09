const { SlashCommandBuilder, EmbedBuilder, InteractionResponseFlags } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const rideStore = require('../data/rideStore');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rides')
    .setDescription('Manage ride board')

    // /rides offer
    .addSubcommand(sub =>
      sub.setName('offer')
        .setDescription('Offer a ride to/from camp or town')
        .addStringOption(option =>
          option.setName('to')
            .setDescription('Where is this ride going?')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('departure')
            .setDescription('When does the ride depart? Include date and time (e.g., Sat 6/15 at 2:30pm)')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('meeting_location')
            .setDescription('Where should riders meet you? (e.g., Dining Hall, Parking Lot B)')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('seats')
            .setDescription('How many seats are available?')
            .setRequired(true)
            .addChoices(
              { name: '1', value: 1 },
              { name: '2', value: 2 },
              { name: '3', value: 3 },
              { name: '4', value: 4 },
              { name: '5', value: 5 },
              { name: '6', value: 6 },
              { name: '7', value: 7 },
              { name: '8', value: 8 }
            ))
        .addIntegerOption(option =>
          option.setName('expires_in')
            .setDescription('When should this ride expire?')
            .setRequired(true)
            .addChoices(
              { name: '1 day', value: 1 },
              { name: '2 days', value: 2 },
              { name: '3 days', value: 3 },
              { name: '4 days', value: 4 },
              { name: '5 days', value: 5 },
              { name: '6 days', value: 6 },
              { name: '7 days', value: 7 },
              { name: '8 days', value: 8 },
              { name: '9 days', value: 9 },
              { name: '10 days', value: 10 },
              { name: '11 days', value: 11 },
              { name: '12 days', value: 12 },
              { name: '13 days', value: 13 },
              { name: '14 days', value: 14 }
            ))
        .addStringOption(option =>
          option.setName('notes')
            .setDescription('Optional notes for your ride')
            .setRequired(false))
    )

    // /rides close
    .addSubcommand(sub =>
      sub.setName('close')
        .setDescription('Close a posted ride early')
        .addStringOption(option =>
          option.setName('message_id')
            .setDescription('Optional: Message ID of the ride post to close')
            .setRequired(false)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // 🟢 OFFER
    if (sub === 'offer') {
      const destination = interaction.options.getString('to');
      const departure = interaction.options.getString('departure');
      const meetingLocation = interaction.options.getString('meeting_location');
      const seats = interaction.options.getInteger('seats');
      const notes = interaction.options.getString('notes') || 'None';
      const expiresInDays = interaction.options.getInteger('expires_in');
      const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
      const expirationText = `<t:${Math.floor(expiresAt / 1000)}:F>`;
      const rideId = uuidv4().slice(0, 6);
      const rideChannel = interaction.client.channels.cache.get(process.env.RIDE_CHANNEL_ID);

      if (!rideChannel) {
        return interaction.reply({
          content: '❌ Ride channel not found. Check RIDE_CHANNEL_ID in your .env.',
          flags: InteractionResponseFlags.Ephemeral
        });
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
          { name: '⏳ Expires', value: expirationText }
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

        await interaction.reply({
          content: '✅ Your ride has been posted to the board!',
          flags: InteractionResponseFlags.Ephemeral
        });
      } catch (err) {
        console.error('❌ Error posting ride:', err);
        await interaction.reply({
          content: 'Something went wrong while posting your ride.',
          flags: InteractionResponseFlags.Ephemeral
        });
      }

    // 🔴 CLOSE
    } else if (sub === 'close') {
      const messageId = interaction.options.getString('message_id');
      const overviewRoleId = process.env.OVERVIEW_ROLE_ID;
      const isInThread = interaction.channel.isThread();
      let ride;

      if (messageId) {
        ride = rideStore.getRide(messageId);
      } else if (isInThread) {
        const threadId = interaction.channel.id;
        ride = Object.values(rideStore.getAllRides()).find(r => r.threadId === threadId);
      }

      if (!ride) {
        return interaction.reply({
          content: '❌ Ride not found. Provide a message ID or use this inside the ride thread.',
          flags: InteractionResponseFlags.Ephemeral
        });
      }

      const isOwner = ride.driverId === interaction.user.id;
      const isOverview = interaction.member.roles.cache.has(overviewRoleId);

      if (!isOwner && !isOverview) {
        return interaction.reply({
          content: '❌ You do not have permission to close this ride.',
          flags: InteractionResponseFlags.Ephemeral
        });
      }

      try {
        const channel = await interaction.client.channels.fetch(ride.channelId);
        const message = await channel.messages.fetch(ride.messageId);
        const embed = EmbedBuilder.from(message.embeds[0]);

        embed.addFields({ name: 'Status', value: '🔒 Closed Early' });
        embed.setColor('Red');

        await message.edit({ embeds: [embed] });
        await message.reactions.removeAll();
        rideStore.removeRide(ride.messageId);

        return interaction.reply({
          content: '✅ Ride closed successfully.',
          flags: InteractionResponseFlags.Ephemeral
        });
      } catch (err) {
        console.error('Error closing ride:', err);
        return interaction.reply({
          content: '❌ Could not close the ride due to an error.',
          flags: InteractionResponseFlags.Ephemeral
        });
      }
    }
  },

  getRideStore() {
    return rideStore;
  }
};
