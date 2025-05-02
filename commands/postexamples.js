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
  )
  .addChannelOption(option =>
    option.setName('severe_alert_channel')
      .setDescription('Channel for the severe weather alert example')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(true)
  ),


  async execute(interaction) {
    const forecastChannel = interaction.options.getChannel('forecast_channel');
    const summaryChannel = interaction.options.getChannel('summary_channel');
    const advisoryChannel = interaction.options.getChannel('advisory_channel');
    const severeChannel = interaction.options.getChannel('severe_alert_channel');

    // Forecast Embed
    const forecastEmbed = new EmbedBuilder()
  .setTitle('🌤️ Camp Tockwogh Forecast (Example)')
  .addFields(
    { name: 'Date', value: 'July 15, 2025', inline: true },
    { name: 'Current Time', value: '7:00 AM EDT / 11:00 UTC\n🌅 Good Morning', inline: true },
    { name: 'Forecast Window', value: '7:00 AM → 12:00 PM EDT', inline: false },
    { name: 'Temperature', value: '🔻 71°F (21.7°C)\n🔺 78°F (25.6°C)', inline: true },
    { name: 'Humidity', value: '🔻 65%\n🔺 78%', inline: true },
    { name: 'Wind', value: '🔻 4.0 mph (1.8 m/s)\n🔺 10.0 mph (4.5 m/s)\n➡️ Direction: NE avg', inline: true },
    { name: 'Wave Height', value: '🔻 1.0 ft (0.30 m)\n🔺 1.8 ft (0.55 m)', inline: true },
    { name: 'Water Temp', value: '🔻 72.0°F (22.2°C)\n🔺 74.2°F (23.4°C)', inline: true },
    { name: 'Sky Conditions', value: 'Mostly Sunny, Partly Cloudy', inline: true },
    { name: 'Tides', value: 'High at 6:42 AM\nLow at 12:31 PM\nHigh at 7:03 PM\nLow at 1:25 AM', inline: false },
    { name: 'Sunrise / Sunset', value: '🌅 5:58 AM / 🌇 8:04 PM', inline: true },
    { name: 'Moon Phase', value: '🌖 Waning Gibbous', inline: true },
    { name: 'Next Forecast', value: '**12:00 PM EDT / 16:00 UTC**', inline: false }
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

      // Severe Weather Embed
const severeEmbed = new EmbedBuilder()
  .setTitle('🌪️ Severe Thunderstorm Warning')
  .setDescription('**Severe Thunderstorm Warning for Kent County**\n\nWinds in excess of 60 MPH and quarter-sized hail expected.')
  .addFields(
    { name: 'Severity', value: 'Severe', inline: true },
    { name: 'Affected Area', value: 'Kent County, MD', inline: true },
    { name: 'Expires', value: '5:45 PM EDT', inline: false },
    { name: 'Instructions', value: 'Take shelter in a sturdy building. Avoid windows. Do not drive through flooded roadways.', inline: false }
  )
  .setColor(0xff0000)
  .setFooter({ text: 'Alert provided by National Weather Service' })
  .setTimestamp();

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

      await severeChannel.send({
      content: '**Example Post for:** Severe Weather Alert',
      embeds: [severeEmbed]
      });


    await interaction.reply({ content: '✅ Example embeds sent to selected channels.', ephemeral: true });
  }
};
