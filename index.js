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

// RULES (2 pinned posts, updated via Railway)
const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID;
const RULES_MESSAGE_1 = process.env.RULES_MESSAGE_1;
const RULES_MESSAGE_2 = process.env.RULES_MESSAGE_2;

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

// ---------------- RULES (2 PERMANENT PINNED POSTS) ----------------
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
  if (process.env.RULES_MESSAGE_1_ID) {
    msg1 = await channel.messages.fetch(process.env.RULES_MESSAGE_1_ID).catch(() => null);
  }

  if (process.env.RULES_MESSAGE_2_ID) {
    msg2 = await channel.messages.fetch(process.env.RULES_MESSAGE_2_ID).catch(() => null);
  }

  // Create if missing
  if (!msg1) {
    msg1 = await channel.send(page1);
    try { await msg1.pin(); } catch {}
    console.log("✅ Created Rules Page 1");
    console.log("RULES_MESSAGE_1_ID =", msg1.id);
  } else if (msg1.content !== page1) {
    await msg1.edit(page1);
  }

  if (!msg2) {
    msg2 = await channel.send(page2);
    try { await msg2.pin(); } catch {}
    console.log("✅ Created Rules Page 2");
    console.log("RULES_MESSAGE_2_ID =", msg2.id);
  } else if (msg2.content !== page2) {
    await msg2.edit(page2);
  }
}
      }
    }
  }

  console.log(`✅ Rules posts ensured: ${pages.length} page(s).`);
}

// ---------------- READY ----------------
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });

  await deployCommands();

  // Ensure rules posts exist + pinned (updates if Railway text changed)
  await ensureRulesPosts();

  // Reset support channel every day at 12:00 AM America/New_York
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
