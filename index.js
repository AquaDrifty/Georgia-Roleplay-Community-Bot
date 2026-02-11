import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !WELCOME_CHANNEL_ID) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("✅ Slash commands registered.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });
  await deployCommands();
});

// ---- JOIN: WELCOME + AUTO ROLE (DEDUPED) ----
client.on("guildMemberAdd", async (member) => {
  try {
    // Don't welcome bots
    if (member.user.bot) return;

    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) return;

    const welcomeText = `Welcome to **Georgia Roleplay Community**, <@${member.id}>!`;

    // ✅ DEDUPE: check recent messages so we don't double-welcome
    // (Works even if two instances are running)
    const recent = await channel.messages.fetch({ limit: 10 });
    const alreadyWelcomed = recent.some((m) => {
      const isBot = m.author?.id === client.user.id;
      const recentEnough = Date.now() - m.createdTimestamp < 60_000; // 60 seconds
      const sameUser = m.content.includes(`<@${member.id}>`);
      const sameWelcome = m.content.includes("Welcome to **Georgia Roleplay Community**");
      return isBot && recentEnough && sameUser && sameWelcome;
    });

    if (!alreadyWelcomed) {
      await channel.send(welcomeText);
    }

    // Auto role
    if (!AUTO_ROLE_ID) return;

    const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
    if (!role) return;

    // Optional: prevent re-adding if they somehow already have it
    if (member.roles.cache.has(role.id)) return;

    await member.roles.add(role);
  } catch (err) {
    console.error("guildMemberAdd error:", err);
  }
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
      allowedMentions: { users: [] }, // show mention without pinging you
    });
    return;
  }
});

client.login(TOKEN);
