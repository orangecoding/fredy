### Telegram Adapter

Use this adapter to send notifications to Telegram via a bot. You will need:
- A Telegram Bot token (from BotFather)
- A chat ID (where messages will be sent)
- Optionally: a thread ID if you want to post into a specific forum topic in a group

#### Create a bot
Create a bot with BotFather: open https://telegram.me/BotFather on your phone or in Telegram Desktop and follow the instructions to get your bot token.

#### Getting the chat ID
A Telegram bot cannot message a user first; you must create a conversation (or add the bot to a group/channel) so Telegram assigns a chat the bot can access.

Steps:
1. Start a chat with your bot in Telegram (or add the bot to your group/supergroup/channel) and send any message.
2. Fetch recent updates from the Bot API:
   ```
   curl -X GET "https://api.telegram.org/bot{YOUR_TELEGRAM_TOKEN}/getUpdates"
   ```
3. In the JSON response, find the message that you just sent and read `message.chat.id`. That value is your `chatId`.
   - Private chats: `chat.id` is a positive number
   - Groups/supergroups: `chat.id` is a negative number

Keep your bot token secret. If `getUpdates` returns an empty list, send a new message and try again, or make sure your bot’s privacy settings allow it to see group messages when used in groups.

#### Getting the thread ID (this is optional to be used for forum topics)
If you want messages to appear inside a specific forum topic of a supergroup with Topics enabled, you also need a thread ID. In the Telegram Bot API this is called `message_thread_id`.

When you need it:
- Required only for supergroups with Topics enabled when targeting a topic
- Not used for private chats, basic groups without Topics, or channels

Steps to obtain it:
1. In your supergroup, enable Topics (Group settings → Manage group → Topics → Enable). Now add a new topic.
2. Add your created bot to the topic. (Click on the bot and on "Add to group")
3. Open the desired topic (or create a new one) and send any message inside that topic.
4. Call `getUpdates` again:
   ```
   curl -X GET "https://api.telegram.org/bot{YOUR_TELEGRAM_TOKEN}/getUpdates"
   ```
4. In the update for the message you sent inside the topic, read `message.message_thread_id`. That number is your `threadId` for this topic.

Example (truncated):
```
{
  "message": {
    "chat": { "id": -1001234567890, "type": "supergroup" },
    "message_thread_id": 42,
    "text": "hello from the topic"
  }
}
```
Use `chat.id` as `chatId` and `message_thread_id` as `threadId` in your configuration.

More details about bots and BotFather: https://core.telegram.org/bots#botfather
