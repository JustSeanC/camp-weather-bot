require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands'); // adjust if needed
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('🔁 Refreshing slash commands...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID), // Use GUILD_ID here instead for guild-specific
      { body: commands }
    );

    console.log('✅ Slash commands registered globally.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
