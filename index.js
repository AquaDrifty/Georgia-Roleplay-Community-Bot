import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import cron from "node-cron";

// =====================
// ENV
// =====================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID;

const SUPPORT_CHANNEL_ID = process.env.SUPPORT_CHANNEL_ID;
// You said your Railway var is SUPPORT_DAILY_MESSAGE (not SUPPORT_MESSAGE)
const SUPPORT_DAILY_MESSAGE = process.env.SUPPORT_DAILY_MESSAGE;

const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID;
const RULES_MESSAGE_1 = process.env.RULES_MESSAGE_1;
const RULES_MESSAGE_2 = process.env.RULES_MESSAGE_2;

// These let the bot “remember” which 2 messages are the rules posts.
// Put the IDs into Railway variables after first run.
const RULES_MESSAGE_1_ID = process.env.RULES_MESSAGE_1_ID;
const RULES_MESSAGE_2_ID = process.env.RULES_MESSAGE_2_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, GUILD_ID");
  process.exit(1);
}

// =====================
// CLIENT
// =====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// =====================
// SLASH COMMANDS
// =====================
const commands = [
  new SlashCommandBuilder().setName("ping").setDescription("Check if the bot is online.").toJSON(),
  new SlashCommandBuilder().setName("credits").setDescription("See who developed the bot.").toJSON(),
];

const rest = new REST({ version: "10" }).setToken(TOKEN);

async function deployCommands() {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash commands registered.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
}

// =====================
// RULES (2 MESSAGES, NO PINNING, NO DELETING)
// =====================
async function ensureRulesPosts() {
  if (!RULES_CHANNEL_ID) return;

  const channel = await client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const page1 = RULES_MESSAGE_1;
  const page2 = RULES_MESSAGE_2;
  if (!page1 || !page2) return;

  let msg1 = null;
  let msg2 = null;

  // Try fetching existing saved messages
  if (RULES_MESSAGE_1_ID) {
    msg1 = await channel.messages.fetch(RULES_MESSAGE_1_ID).catch(() => null);
  }
  if (RULES_MESSAGE_2_ID) {
    msg2 = await channel.messages.fetch(RULES_MESSAGE_2_ID).catch(() => null);
  }

  // Create if missing (and log IDs for first-time setup)
  if (!msg1) {
    msg1 = await channel.send(page1);
    console.log("✅ Created Rules Page 1");
    console.log("RULES_MESSAGE_1_ID =", msg1.id);
  } else if (msg1.content !== page1) {
    await msg1.edit(page1);
    console.log("✅ Updated Rules Page 1");
  }

  if (!msg2) {
    msg2 = await channel.send(page2);
    console.log("✅ Created Rules Page 2");
    console.log("RULES_MESSAGE_2_ID =", msg2.id);
  } else if (msg2.content !== page2) {
    await msg2.edit(page2);
    console.log("✅ Updated Rules Page 2");
  }
}

// =====================
// SUPPORT DAILY RESET @ 12:00 AM EST
// =====================
// If you ever change timezones, update this.
async function resetSupportChannel() {
  if (!SUPPORT_CHANNEL_ID || !SUPPORT_DAILY_MESSAGE) return;

  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  try {
    // Delete recent messages to “reset” (Discord bulk delete limit is last 14 days)
    const msgs = await channel.messages.fetch({ limit: 100 });
    if (msgs.size > 0) {
      await channel.bulkDelete(msgs, true).catch(() => {});
    }

    // Re-post your daily message
    await channel.send(SUPPORT_DAILY_MESSAGE);
    console.log("✅ Support channel reset + message posted.");
  } catch (err) {
    console.error("Support reset failed:", err);
  }
}

// =====================
// READY
// =====================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });

  await deployCommands();

  // Post/repair rules on startup (no pinning, no deleting other messages)
  await ensureRulesPosts();

  // Cron: 12:00 AM America/New_York (EST/EDT safe)
  cron.schedule(
    "0 0 * * *",
    async () => {
      await resetSupportChannel();
    },
    { timezone: "America/New_York" }
  );

  console.log("✅ Cron scheduled for 12:00 AM America/New_York.");
});

// =====================
// JOIN: WELCOME + AUTO ROLE
// =====================
client.on("guildMemberAdd", async (member) => {
  // Welcome
  if (WELCOME_CHANNEL_ID) {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      channel.send(`Welcome to **Georgia Roleplay Community**, ${member}!`);
    }
  }

  // Auto role
  if (!AUTO_ROLE_ID) return;

  const role = member.guild.roles.cache.get(AUTO_ROLE_ID);
  if (!role) return;

  try {
    await member.roles.add(role);
  } catch (err) {
    console.error("Failed to auto-assign role:", err);
  }
});

// =====================
// COMMAND HANDLER
// =====================
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("✅ Georgia Roleplay Community's Bot is online!");
    return;
  }

  if (interaction.commandName === "credits") {
    const devId = "698301697134559308"; // Dallas
    await interaction.reply({
      content: `This bot is developed by <@${devId}>`,
      allowedMentions: { users: [] }, // shows mention without pinging
    });
    return;
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
