const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postexamples')
    .setDescription('Post example embeds to specified channels')
    .addChannelOption(option =>
      option.setName('forecast_channel')
        .setDescription('Channel for the forecast example')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('summary_channel')
        .setDescription('Channel for the daily summary example')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addChannelOption(option =>
      option.setName('advisory_channel')
        .setDescription('Channel for the small craft advisory example')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    const forecastChannel = interaction.options.getChannel('forecast_channel');
    const summaryChannel = interaction.options.getChannel('summary_channel');
    const advisoryChannel = interaction.options.getChannel('advisory_channel');

    // Forecast Embed
    const forecastEmbed = new EmbedBuilder()
      .setTitle('🌤️ Camp Tockwogh Forecast (Example)')
      .setDescription('This is an example of the regularly scheduled weather forecast embed.')
      .addFields(
        { name: 'Time', value: '12:00 PM EDT / 16:00 UTC', inline: true },
        { name: 'Forecast Window', value: '12:00 PM → 5:00 PM EDT', inline: false },
        { name: 'Temperature', value: '75°F (23.9°C) → 82°F (27.8°C)', inline: true },
        { name: 'Wind', value: '5.0 mph (2.2 m/s) → 12.0 mph (5.4 m/s)\nDirection: NE avg', inline: true },
        { name: 'Sky Conditions', value: 'Partly Cloudy', inline: true },
        { name: 'Wave Height', value: '1.2 ft (0.37 m) → 2.0 ft (0.61 m)', inline: true },
        { name: 'Water Temp', value: '72.0°F (22.2°C)', inline: true },
        { name: 'Sunrise / Sunset', value: '🌅 5:58 AM / 🌇 8:04 PM', inline: false },
        { name: 'Moon Phase', value: '🌖 Waning Gibbous', inline: false },
        { name: 'Next Forecast', value: '**5:00 PM EDT / 21:00 UTC**', inline: false }
      )
      .setFooter({ text: 'Forecast data from Storm Glass. Advisory logic is estimated.' })
      .setColor(0x00ff00);

    // Summary Embed
    const summaryEmbed = new EmbedBuilder()
      .setTitle('📋 Daily Summary for April 30th, 2025')
      .setDescription('Time range: 12:00 AM → 11:00 PM')
      .addFields(
        { name: 'High Temp', value: '82°F (27.8°C)', inline: true },
        { name: 'Low Temp', value: '65°F (18.3°C)', inline: true },
        { name: 'Max Wind Speed', value: '14.0 mph (6.3 m/s)', inline: true },
        { name: 'Max Wave Height', value: '2.5 ft (0.76 m)', inline: true },
        { name: 'Sky Conditions', value: 'Partly Cloudy', inline: true },
        { name: 'Water Temp (avg)', value: '72.4°F (22.4°C)', inline: true },
        { name: 'Marine Alerts', value: '✅ No alerts posted yesterday', inline: false }
      )
      .setFooter({ text: 'Summary based on data from Storm Glass & NOAA (weather.gov)' })
      .setColor(0x0077be);

    // Advisory Embed
    const advisoryEmbed = new EmbedBuilder()
      .setTitle('⚠️ Small Craft Advisory ⚠️')
      .setDescription('**Advisory in effect until 9:00 PM**\n\nHazardous wind and wave conditions expected.')
      .addFields(
        { name: 'Area', value: 'Chesapeake Bay from North Beach to Drum Point', inline: false },
        { name: 'Issued', value: '2:15 PM EDT', inline: true },
        { name: 'Expires', value: '9:00 PM EDT', inline: true },
        { name: 'Instructions', value: 'Inexperienced mariners should avoid navigating in these conditions.', inline: false }
      )
      .setFooter({ text: 'Data provided by NOAA (weather.gov)' })
      .setColor(0xffa500);

      await forecastChannel.send({
        content: '**Example Post for:** Weather Forecast',
        embeds: [forecastEmbed]
      });
      
      await summaryChannel.send({
        content: '**Example Post for:** Daily Summary',
        embeds: [summaryEmbed]
      });
      
      await advisoryChannel.send({
        content: '**Example Post for:** Small Craft Advisory',
        embeds: [advisoryEmbed]
      });
      

    await interaction.reply({ content: '✅ Example embeds sent to selected channels.', ephemeral: true });
  }
};
