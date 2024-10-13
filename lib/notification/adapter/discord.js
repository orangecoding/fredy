import { Client, EmbedBuilder, Events, GatewayIntentBits } from "discord.js";
import { markdown2Html } from "../../services/markdown.js";

export const send = async ({
  newListings,
  notificationConfig,
  serviceName,
}) => {
  const { botToken, channelId } = notificationConfig.find(
    (adapter) => adapter.id === config.id,
  ).fields;

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async () => {
    const channel = await client.channels.fetch(channelId);

    if (channel) {
      for (const listing of newListings) {
        if (!listing.link || !listing.price) continue;

        const listingEmbed = new EmbedBuilder()
          .setColor(0x0099ff)
          .setTitle(listing.title)
          .setURL(listing.link)
          .setAuthor({ name: serviceName })
          .addFields(
            { name: "Preis", value: listing.price, inline: true },
            { name: "Fläche", value: listing.size, inline: true },
          )
          .setTimestamp();

        if (listing.address) listingEmbed.setDescription(listing.address);

        await channel.send({ embeds: [listingEmbed] });
      }
    }

    await client.destroy();
  });

  await client.login(botToken);
};

export const config = {
  id: "discord",
  name: "Discord",
  description:
    "Discord is being used to send new listings via a Discord channel.",
  readme: markdown2Html("lib/notification/adapter/discord.md"),
  fields: {
    botToken: {
      type: "text",
      label: "Bot Token",
      description: "The token of the Discord bot used to send messages.",
    },
    channelId: {
      type: "text",
      label: "Channel ID",
      description: "The ID of the Discord channel where messages will be sent.",
    },
  },
};
