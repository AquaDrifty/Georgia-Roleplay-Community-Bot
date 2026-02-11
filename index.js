import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

// =====================
// ENV
// =====================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const AUTO_ROLE_ID = process.env.AUTO_ROLE_ID;

const SUPPORT_CHANNEL_ID = process.env.SUPPORT_CHANNEL_ID; // nightly reset channel
const SUPPORT_MESSAGE = process.env.SUPPORT_MESSAGE; // message to re-post nightly (optional)

const RULES_CHANNEL_ID = process.env.RULES_CHANNEL_ID; // permanent rules channel
const RULES_MESSAGE_1 = process.env.RULES_MESSAGE_1; // page 1 text
const RULES_MESSAGE_2 = process.env.RULES_MESSAGE_2; // page 2 text

// For stable rules posts (set AFTER first run; bot prints them in logs)
const RULES_MESSAGE_1_ID = process.env.RULES_MESSAGE_1_ID; // optional
const RULES_MESSAGE_2_ID = process.env.RULES_MESSAGE_2_ID; // optional

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

// =====================
// HELPERS
// =====================
function msUntilNextMidnightEST() {
  // EST/EDT-safe approach using Intl formatting
  // We compute "now in America/New_York" then find next midnight there.
  const tz = "America/New_York";

  const now = new Date();

  // Get Y/M/D in NY time
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));

  // Next day at 00:00:00 NY time
  // We build a Date using UTC then offset by NY time via formatter.
  // Simplest reliable method: create a date string and let JS parse as local,
  // then adjust by comparing to NY time. Instead, we do iterative approach:
  const nextNYMidnightLocal = new Date(now.getTime());
  nextNYMidnightLocal.setHours(0, 0, 0, 0);
  nextNYMidnightLocal.setDate(nextNYMidnightLocal.getDate() + 1);

  // Convert that "local midnight" moment to "NY midnight moment" by finding
  // the real instant that corresponds to midnight in NY:
  // We'll find the UTC timestamp for NY midnight by constructing an ISO-like
  // string and using Intl to adjust.
  const nyMidnight = new Date(
    `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y} 00:00:00`
  );

  // nyMidnight above is in server-local timezone. We need the next midnight in NY.
  // So instead: get current time in NY, then compute delta to next NY midnight
  const nowNY = new Date(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now)
  );

  const nextNY = new Date(nowNY);
  nextNY.setHours(0, 0, 0, 0);
  nextNY.setDate(nextNY.getDate() + 1);

  return nextNY.getTime() - nowNY.getTime();
}

async function resetSupportChannel() {
  if (!SUPPORT_CHANNEL_ID) return;

  const channel = await client.channels.fetch(SUPPORT_CHANNEL_ID).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  try {
    // Delete recent messages (Discord limits bulk delete to <14 days)
    // We'll fetch up to 100 and delete what we can.
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (messages) {
      // Bulk delete where possible
      await channel.bulkDelete(messages, true).catch(() => {});
    }

    // Repost the pinned/standard support message
    if (SUPPORT_MESSAGE) {
      await channel.send(SUPPORT_MESSAGE);
    }
  } catch (err) {
    console.error("Support channel reset failed:", err);
  }
}

function scheduleNightlySupportReset() {
  if (!SUPPORT_CHANNEL_ID || !SUPPORT_MESSAGE) return;

  const run = async () => {
    await resetSupportChannel();
    // schedule again for next midnight
    setTimeout(run, msUntilNextMidnightEST());
  };

  setTimeout(run, msUntilNextMidnightEST());
  console.log("✅ Nightly support reset scheduled for 12:00am EST.");
}

// =====================
// RULES (2 PERMANENT PINNED POSTS, STABLE IDs)
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

  // Try fetching existing saved messages by ID (stable across redeploys)
  if (RULES_MESSAGE_1_ID) {
    msg1 = await channel.messages.fetch(RULES_MESSAGE_1_ID).catch(() => null);
  }
  if (RULES_MESSAGE_2_ID) {
    msg2 = await channel.messages.fetch(RULES_MESSAGE_2_ID).catch(() => null);
  }

  // Create if missing; log IDs so you can paste into Railway variables
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

// =====================
// EVENTS
// =====================
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setActivity("Georgia Roleplay Community", { type: 3 });

  await deployCommands();

  // Ensure rules posts exist + pinned + stable
  await ensureRulesPosts();

  // Schedule support reset at 12:00am EST
  scheduleNightlySupportReset();
});

// Welcome + auto role
client.on("guildMemberAdd", async (member) => {
  // Welcome message
  if (WELCOME_CHANNEL_ID) {
    const channel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      channel.send(`Welcome to **Georgia Roleplay Community**, ${member}!`).catch(() => {});
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

// Slash commands
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
      allowedMentions: { users: [] }, // shows mention text without ping
    });
    return;
  }
});

// =====================
// LOGIN
// =====================
client.login(TOKEN);
