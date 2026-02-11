import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import cron from "node-cron";

// ---- ENV VARS ----
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const WELCOME_MESSAGE =
  process.env.WELCOME_MESSAGE ?? "Welcome to **Georgia Roleplay Community**, {user}!";

const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID;

const SUPPORT_CHANNEL_ID = process.env.SUPPORT_CHANNEL_ID;
const SUPPORT_DAILY_MESSAGE =
  process.env.SUPPORT_DAILY_MESSAGE ??
  `**Georgia Roleplay Community Help & Support**\n\nThis channel resets every night at 12:00am to keep things clean.\n\n• Be respectful\n• Provide clear details\n• Stay on topic\n• Mention staff only if necessary\n• Be patient if they dont answer right away`;

// RULES (permanent post, no commands)
const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID; // e.g. 1469558618897780860
const RULES_MESSAGE = process.env.RULES_MESSAGE; // paste full rules text in Railway

if (!TOKEN || !CLIENT_ID || !GUILD_ID || !WELCOME_CHANNEL_ID) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// ---- SLASH COMMANDS ----
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

// ---------------- SUPPORT RESET HELPERS ----------------
async function purgeChannel(channel) {
  let totalDeleted = 0;

  while (true) {
    const messages = await channel.messages.fetch({ limit: 100 });
    if (messages.size === 0) break;

    // Bulk delete (< 14 days)
    const bulkDeletable = messages.filter((m) => m.bulkDeletable);
    if (bulkDeletable.size > 0) {
      const deleted = await channel.bulkDelete(bulkDeletable, true);
      totalDeleted += deleted.size;
    }

    // Delete older messages one-by-one (rate-limit friendly)
    const oldOnes = messages.filter((m) => !m.bulkDeletable);
    if (oldOnes.size > 0) {
      for (const msg of oldOnes.values()) {
        try {
          await msg.delete();
          totalDeleted += 1;
          await new Promise((r) => setTimeout(r, 350));
        } catch {
          // ignore
        }
      }
    }

    if (bulkDeletable.size === 0 && oldOnes.size === 0) break;
  }

  return totalDeleted;
}

async function resetSupportChannel() {
  if (!SUPPORT_CHANNEL_ID) return;

  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  console.log("🧹 Resetting support channel...");
  const deletedCount = await purgeChannel(channel);
  console.log(`🧼 Deleted ${deletedCount} messages.`);

  await channel.send(SUPPORT_DAILY_MESSAGE);
  console.log("✅ Posted daily support message.");
}

// ---------------- RULES (PERMANENT PINNED POST) ----------------
async function getRulesChannel() {
  if (!RULES_CHANNEL_ID) return null;
  const ch = await client.channels.fetch(RULES_CHANNEL_ID).catch(() => null);
  if (!ch || !ch.isTextBased()) return null;
  return ch;
}

async function findPinnedBotMessage(channel) {
  const pins = await channel.messages.fetchPinned().catch(() => null);
  if (!pins) return null;
  return pins.find((m) => m.author?.id === client.user.id) ?? null;
}

async function ensureRulesPost() {
  // If you haven't set these in Railway yet, do nothing.
  if (!RULES_CHANNEL_ID || !RULES_MESSAGE) return;

  const channel = await getRulesChannel();
  if (!channel) return;

  let msg = await findPinnedBotMessage(channel);

  // If no pinned bot message exists, create + pin it
  if (!msg) {
    msg = await channel.send(RULES_MESSAGE);
    try {
      await msg.pin();
    } catch (e) {
      console.error("Could not pin rules message (need Manage Messages):", e);
    }
    console.log("✅ Rules message created + pinned.");
    return;
  }

  // If pinned exists, update it only if changed
  if (msg.content !== RULES_MESSAGE) {
    await msg.edit(RULES_MESSAGE);
    console.log("✅ Rules message updated (edited pinned message).");
  } else {
    console.log("✅ Rules message already up to date.");
  }
}

// ---------------- READY ----------------
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });

  await deployCommands();

  // Make sure rules post exists + pinned
  await ensureRulesPost();

  // Every day at 12:00 AM EST/EDT (America/New_York handles DST)
  cron.schedule(
    "0 0 * * *",
    async () => {
      await resetSupportChannel();
    },
    { timezone: "America/New_York" }
  );

  console.log("⏰ Support reset scheduled for 12:00 AM America/New_York.");
});

// ---------------- JOIN: WELCOME + AUTO ROLE ----------------
client.on("guildMemberAdd", async (member) => {
  if (member.user.bot) return;

  // Welcome message
  const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (channel) {
    const msg = WELCOME_MESSAGE.replace("{user}", `${member}`);
    channel.send(msg);
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

// ---------------- COMMAND HANDLER ----------------
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
      allowedMentions: { users: [] }, // shows mention without pinging
    });
    return;
  }
});

client.login(TOKEN);
