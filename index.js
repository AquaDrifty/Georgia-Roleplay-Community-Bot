import { Client, GatewayIntentBits } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;

if (!TOKEN) {
  console.error("No DISCORD_TOKEN provided.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once("ready", () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
  client.user.setActivity("Georgia Roleplay Community", { type: 3 });
});

client.login(TOKEN);
