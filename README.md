# Fredy  
  
[F]ind [R]eal [E]states [D]amn Eas[y] :heart:  
  
My wife and I wanted to buy an apartment in germany. As the prices are quite high and good deals are very rare, we searched the "big 4" every morning.     
  
This however can get pretty frustrating. _Fredy_ will take this work away from you. It crawls the `provider`, mentioned below (Immonet, Immoscout...) every _x_ minutes. (The provider list can be extended easily...)     
  
If _Fredy_ found matching results, it will send them to via Slack. (More adapter possible.) _Fredy_ is remembering what it already has found to not send stuff twice.  
  
## Usage  
  
- Make sure to use Node 11 and above  
- Install the dependencies using `npm install` or `yarn`  
- create your configuration file. Use the example config for this. `cp conf/config.example conf/config.json`  
- configure the desired values  
- start _Fredy_ using `npm start` or `yarn run start`  
  
## :point_up: Breaking Changes when updating from v1.x to v2
See [Upgrade Guide](./doc/upgrade-from-1-to-2.md)
  
## Configuration  
  
Before running _Fredy_ for the first time, you need to create a configuration file:  
  
Copy the example config as a start.  
```  
cp conf/config.example conf/config.json  
```  
  
### 1. Notification  
  
You want to get notified when _Fredy_ found a new listing. Currently _Fredy_ support Slack and Telegram to send notification. _Fredy_ also includes a notification adapter to print to the console instead of sending to a services.  
  
Adding new notification adapter is easy however. See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md)  
  
##### Slack 
```json  
"slack": {  
 "channel": "someChannel", "token": "someToken", "enabled": true}  
```  
  
##### Telegram  
```json  
"telegram": {  
 "chatId": "someChannel", "token": "someToken", "enabled": true}  
```  
  
For Telegram, you need to create a Bot. This is pretty easy. Open [this](https://telegram.me/BotFather) url on your smartphone and follow the instructions.  
A telegram bot is not allowed to send messages directly to a user, you as a user need to first contact the bot to get a chatId.     
After the user has send a message to your bot the first time, you can gather the chatId like this:   
```  
curl -X GET https://api.telegram.org/bot{YOUR_TELEGRAM_TOKEN}/getUpdates  
```  
  
A more detailed list of instructions can be found here [https://core.telegram.org/bots#botfather](https://core.telegram.org/bots#botfather)   
  
### 2. Multiple search jobs 

Since v2.0.0, Fredy supports multiple search jobs running within the same instance of Fredy. For this to work correctly, you need to give each search job a unique name.
See the example config... 
```json
(...)
 "jobs": {
    "yourSearchJob": {
      "some":"config"
    },
    "yourOtherSearchJob": {
     "some":"config"
    }
}
(...)
```  
  
### 3. Configure the providers  
  
Configure the providers like described below. To disable a provider just remove its entry from the configuration or set it to `false`.  
  
#### Immoscout, Immonet and more  
  
These are the current provider that are already implemented within _Fredy_  
  
```json  
"kleinanzeigen": {  
 "url": "https://www.ebay-kleinanzeigen.de/...", "enabled": true}  
"immoscout": {  
 "url": "https://www.immobilienscout24.de/...", "enabled": true},  
"immowelt": {  
 "url": "https://www.immowelt.de/...", "enabled": true},  
"immonet": {  
 "url": "http://www.immonet.de/...", "enabled": true},  
"kalaydo": {  
 "url": "http://www.kalaydo.de/...", "enabled": true},  
"einsAImmobilien": {  
 "url": "https://www.1a-immobilienmarkt.de/...", "enabled": true},  
"neubauKompass": {  
 "url": "https://www.neubaukompass.de/...", "enabled": true},  
"wgGesucht": {  
 "url": "https://www.wg-gesucht.de/...", "enabled": true}  
```  
  
Go to the respective provider page and create your custom search queries by  
using the provided filter options. Then just copy and paste the whole URL of  
the resulting listings page.  
  
**IMPORTANT:** Make sure to always sort by newest listings! This way _Fredy_ makes sure to not accidentally report stuff twice.  
  
#### Custom provider  
  
See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md)  
  
### 4. Add Filters (optional)  
  
  
#### Blacklist  
  
```json  
"blacklist": [  
 "vermietet"
]  
```  
  
Listings which contain at least on of the given terms (ignoring case, only  
whole words) are removed.   
  
#### District blacklist  
```json  
"blacklistedDistricts": [  
 "Altstadt"
]  
```  
Districts that are unwanted can be blacklisted here.   
  
This makes sense for provider that only offer limited filter functions like Kalaydo/Ebay.  
  
# API   
While Fredy is running, you can make use of the rest api provided on port `9988` to get information about the current status of Fredy.  
#### http://localhost:9988/
Gives you an overview of running search jobs, their included enabled provider, last execution and the number of listings, found by each provider. 

#### http://localhost:9988/ping
Should you ever need some health checks, this returns pong ;)

#### http://localhost:9988/jobs/:name
Returns specific information about the job with the given name or `404` if the job could not be found.

# Docker   
Use the Dockerfile in this Repository to build an image.  
  
Example: `docker build -t fredy/fredy /path/to/your/Dockerfile`  
  
## Create & run a container  
  
Put your config.json to `/path/to/your/conf/`  
  
Example: `docker create --name fredy -v /path/to/your/conf/:/conf -p 9876:9876 fredy/fredy`
  
## Logs  
  
You can browse the logs with  `docker logs fredy -f`  
  
