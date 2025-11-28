import {
  Client,
  ContainerBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  TextDisplayBuilder,
} from "discord.js";

declare global {
  var __discord_client__: Client | undefined;
}

export const getClient = () => {
  if (global.__discord_client__) {
    console.log("[Discord] Reusing cached Discord client");
    return global.__discord_client__;
  }

  console.log("[Discord] Creating new Discord client");
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  client.once(Events.ClientReady, (readyClient: Client<true>) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  });

  if (!process.env.DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is not set");
  }

  client.login(process.env.DISCORD_TOKEN);
  global.__discord_client__ = client;
  return client;
};

const client = getClient();

const threadId = process.env.DISCORD_EVENT_THREAD_ID;
if (!threadId) {
  throw new Error("DISCORD_EVENT_THREAD_ID is not set");
}

export let disable = false;

export const setDisable = (value: boolean) => {
  disable = value;
};

export const postEvent = (event: string, markdown: string) => {
  if (disable) {
    return;
  }
  (async () => {
    try {
      const thread = await client.channels.fetch(threadId);
      if (!thread) {
        throw new Error("Thread not found");
      }

      if (thread.isSendable()) {
        console.log(
          `Posting event ${event} to thread ${threadId}: ${markdown}`,
        );
        const container = new ContainerBuilder()
          .setAccentColor(0x1d56bf)
          .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(markdown),
          );

        await thread.send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      } else {
        throw new Error("Thread is not sendable");
      }
    } catch (error) {
      console.error(`[Discord] Failed to post event ${event}:`, error);
    }
  })();
};
