const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const rideStore = require('../data/rideStore');
require('dotenv').config();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rides')
    .setDescription('Manage ride board')
    .addSubcommand(sub =>
        sub.setName('offer')
          .setDescription('Offer a ride to/from camp or town')
          .addStringOption(option =>
            option.setName('to')
              .setDescription('Where is this ride going?')
              .setRequired(true))
          
          
    .addStringOption(option =>
         option.setName('time')
            .setDescription('When does the ride depart? (e.g., Friday at 4pm)')
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
      ),
      

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'offer') {
        const destination = interaction.options.getString('to');
        const time = interaction.options.getString('time');
        const meetingLocation = interaction.options.getString('meeting_location');
      const seats = interaction.options.getInteger('seats');
      const notes = interaction.options.getString('notes') || 'None';
      const expiresInDays = interaction.options.getInteger('expires_in');
      const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
      const expirationText = `<t:${Math.floor(expiresAt / 1000)}:F>`;      
      const rideId = uuidv4().slice(0, 6);
      const rideChannel = interaction.client.channels.cache.get(process.env.RIDE_CHANNEL_ID);

      if (!rideChannel) {
        return interaction.reply({ content: '❌ Ride channel not found. Check RIDE_CHANNEL_ID in your .env.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('🚗 Ride Offer')
        .addFields(
            { name: 'Destination', value: destination, inline: true },
            { name: 'Departure Time', value: time, inline: true },
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
            time,
            destination,
            totalSeats: seats,
            riders: [],
            expiresAt, // ✅ new
          });
          

        await interaction.reply({ content: '✅ Your ride has been posted to the board!', ephemeral: true });
      } catch (err) {
        console.error('❌ Error posting ride:', err);
        await interaction.reply({ content: 'Something went wrong while posting your ride.', ephemeral: true });
      }
    }
  },

  getRideStore() {
    return rideStore;
  }
};
