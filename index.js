const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const axios = require('axios');

// Your Discord Bot Token
const token = '';  // Replace with your bot token

// Create a new Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// Function to fetch live price from Binance API
async function getCryptoPrice(symbol, retries = 3) {
    try {
      const finalSymbol = symbol.endsWith('USDT') ? symbol : symbol + 'USDT';
      const response = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${finalSymbol}`);
      return parseFloat(response.data.price);
    } catch (error) {
      console.error(`Error fetching crypto price for ${symbol}:`, error);

      if (retries > 0) {
        console.log(`Retrying... (${3 - retries + 1}/3)`);
        return getCryptoPrice(symbol, retries - 1);  // Retry the request
      }

      return null;  // Return null if it fails after retries
    }
}

// Function to create the embed with crypto prices
async function createEmbed() {
  const btcPrice = await getCryptoPrice('BTCUSDT');
  const ethPrice = await getCryptoPrice('ETHUSDT');
  const solPrice = await getCryptoPrice('SOLUSDT');
  const notPrice = await getCryptoPrice('NOTUSDT');

  const embed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle('Live Crypto Prices')
    .addFields(
      { name: 'BTC/USDT', value: `$${btcPrice}`, inline: true },
      { name: 'ETH/USDT', value: `$${ethPrice}`, inline: true },
      { name: 'SOL/USDT', value: `$${solPrice}`, inline: true },
      { name: 'NOT/USDT', value: `$${notPrice}`, inline: true }
    )
    .setTimestamp()
    .setFooter({ text: 'Prices from Binance API' });

  return embed;
}

// Event when the bot is ready
client.once('ready', async () => {
  console.log('Bot is online!');

  // Send the initial embed message to the specific channel
  const channel = await client.channels.fetch('1351513736690794507');
  const embed = await createEmbed();

  // Original button to get the crypto price
  const button1 = new ButtonBuilder()
    .setCustomId('get_crypto_price')
    .setLabel('Get Crypto Price')
    .setStyle('Primary');

  // New button to trigger the target price modal
  const button2 = new ButtonBuilder()
    .setCustomId('set_target_price')
    .setLabel('Set Target Price')
    .setStyle('Secondary');

  const row = new ActionRowBuilder().addComponents(button1, button2);

  // Send embed with both buttons
  const sentMessage = await channel.send({ embeds: [embed], components: [row] });

  // Update the embed every 10 seconds
  setInterval(async () => {
    const updatedEmbed = await createEmbed();
    await sentMessage.edit({ embeds: [updatedEmbed] });
  }, 10000);  // Update every 10 seconds

  // Listen for button interactions after message is sent
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;  // Only handle button interactions

    if (interaction.message.id === sentMessage.id) {  // Make sure interaction is from the right message
      if (interaction.customId === 'get_crypto_price') {
        const modal = new ModalBuilder()
          .setCustomId('crypto_modal')
          .setTitle('Enter Crypto Symbol')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('crypto_symbol')
                .setLabel('Crypto Symbol (e.g., BTC, ETH)')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          );
        await interaction.showModal(modal);
      }

      if (interaction.customId === 'set_target_price') {
        const modal = new ModalBuilder()
            .setCustomId('target_price_modal')
            .setTitle('Set Target Price')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('crypto_symbol')
                        .setLabel('Crypto Symbol (e.g., BTC, ETH)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('target_price')
                        .setLabel('Target Price (e.g., 50000)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('note')
                        .setLabel('Add a Note (Optional)')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(false)  // Optional input
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('target_type')
                        .setLabel('Target Type (Long/Short)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('Long or Short')
                )
            );
    
        await interaction.showModal(modal);
      }
    }
  });
});

// Handle the modal submission interaction
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'crypto_modal') {
    const symbol = interaction.fields.getTextInputValue('crypto_symbol').toUpperCase();
    const price = await getCryptoPrice(symbol);

    if (price) {
      await interaction.user.send(`The price of ${symbol} is: $${price}`);
      await interaction.reply({ content: 'I have sent the price to your DMs!', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Sorry, I could not fetch the price for that symbol. Please try again later.', ephemeral: true });
    }
  }

  // Handle target price modal submission
  if (interaction.customId === 'target_price_modal') {
    const symbol = interaction.fields.getTextInputValue('crypto_symbol').toUpperCase();
    const targetPrice = parseFloat(interaction.fields.getTextInputValue('target_price'));
    const note = interaction.fields.getTextInputValue('note') || 'No note provided';
    const targetType = interaction.fields.getTextInputValue('target_type').toLowerCase(); // Long or short target
    const user = interaction.user; // Store user info before interaction expires

    // Function to check price and send DM based on target type (long or short)
    const checkPriceAndNotify = async () => {
      const currentPrice = await getCryptoPrice(symbol);

      if (currentPrice === null) return;

      if (targetType === 'long' && currentPrice >= targetPrice) { // For long target, price should go higher
        clearInterval(priceCheckInterval);  // Stop checking once the target is hit

        try {
          await user.send(`📢 **Target Price Alert!**\n\nThe price of ${symbol} has reached **$${currentPrice.toFixed(2)}** (Target: Long).\n\n📝 **Note:** ${note}`);
        } catch (error) {
          console.error(`Failed to send DM to ${user.tag}:`, error);
        }
      }

      if (targetType === 'short' && currentPrice <= targetPrice) { // For short target, price should go lower
        clearInterval(priceCheckInterval);  // Stop checking once the target is hit

        try {
          await user.send(`📢 **Target Price Alert!**\n\nThe price of ${symbol} has dropped to **$${currentPrice.toFixed(2)}** (Target: Short).\n\n📝 **Note:** ${note}`);
        } catch (error) {
          console.error(`Failed to send DM to ${user.tag}:`, error);
        }
      }
    };

    const priceCheckInterval = setInterval(checkPriceAndNotify, 5000);

    await interaction.reply({ content: 'I will notify you when the target price is hit.', ephemeral: true });
  }
});

// Log in to Discord with your app's token
client.login(token);
