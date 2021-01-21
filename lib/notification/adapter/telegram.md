### Telegram Adapter

 
For Telegram, you need to create a Bot. This is pretty easy. Open [this](https://telegram.me/BotFather) url on your smartphone and follow the instructions.
  
A telegram bot is not allowed to send messages directly to a user, you as a user need to first contact the bot to get a chatId.        
After the user has send a message to your bot the first time, you can gather the chatId like this:   

```  
curl -X GET https://api.telegram.org/bot{YOUR_TELEGRAM_TOKEN}/getUpdates  
```  
  
A more detailed list of instructions can be found here [https://core.telegram.org/bots#botfather](https://core.telegram.org/bots#botfather)
