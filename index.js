import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !WELCOME_CHANNEL_ID) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ---- SLASH COMMANDS ----
const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if the bot is online.")
    .toJSON(),

  new SlashCommandBuilder()
    .setName("credits")
    .setDescription("See who developed the bot.")
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deployCommands() {
  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

// ---- BOT READY ----
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });
  await deployCommands();
});

// ---- WELCOME MESSAGE ----
client.on("guildMemberAdd", async (member) => {
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!channel) return;

  channel.send(`Welcome to **Georgia Roleplay Community**, ${member}!`);
});

// ---- COMMAND HANDLER ----
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("✅ Georgia Roleplay Community's Bot is online!");
    return;
  }

  if (interaction.commandName === "credits") {
    const devId = "698301697134559308";
    await interaction.reply({
      content: `This bot is developed by <@${devId}>`,
      allowedMentions: { users: [] }
    });
    return;
  }
});

client.login(TOKEN);
