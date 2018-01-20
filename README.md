# Fredy

[F]ind [R]eal [E]states [D]amn Eas[y] :heart:

My wife and I wanted to buy an apartment in germany. As the prices are quite high and good deals are very rare, we searched the "big 4" every morning.   

This however can get pretty frustrating. _Fredy_ will take this work away from you. It crawls the `provider`, mentioned below (Immonet, Immoscout...) every _x_ minutes. (The provider list can be extended easily...)   

If _Fredy_ found matching results, it will send them to via Slack. (More adapter possible.) _Fredy_ is remembering what it already has found to not send stuff twice.

## Usage

- Make sure to use Node 8 and above
- Install the dependencies using `npm install`
- create your configuration file. Use the example config for this. `cp conf/config.example conf/config.json`
- configure the desired values
- start _Fredy_ using `npm start`


## Configuration

Before running _Fredy_ for the first time, you need to create a configuration file:

Copy the example config as a start.
```
cp conf/config.example conf/config.json
```

### 1. Notification

You want to get notified when _Fredy_ found a new listing. Currently _Fredy_ support Slack to send notification. _Fredy_ also includes a notification adapter to print to the console instead of sending to a services.

Adding new notification adapter is easy however. See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md) 
```json
"slack": {
  "channel": "someChannel",
  "token": "someToken",
  "enabled": true
}
```

### 2. Configure the providers

Configure the providers like described below. To disable a provider just remove its entry from the configuration or set it to `false`.

#### Ebay Kleinanzeigen, Immoscout, Immowelt, Immonet and Kalaydo

```json
"kleinanzeigen": {
    "url": "https://www.ebay-kleinanzeigen.de/...",
    "enabled": true
}
"immoscout": {
  "url": "https://www.immobilienscout24.de/...",
  "enabled": true
},
"immowelt": {
  "url": "https://www.immowelt.de/...",
  "enabled": true
},
"immonet": {
  "url": "http://www.immonet.de/...",
  "enabled": true
},
"kalaydo": {
  "url": "http://www.kalaydo.de/...",
  "enabled": true
},
```

Go to the respective provider page and create your custom search queries by
using the provided filter options. Then just copy and paste the whole URL of
the resulting listings page.

**IMPORTANT:** Make sure to always sort by newest listings! This way _Fredy_ makes sure to not accidentally report stuff twice.

#### Custom provider

See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md)

### 3. Add Filters (optional)


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
"blacklistedDistrics": [
  "Altstadt"
]
```
Districts that are unwanted can be blacklisted here. 

This makes sense for provider that only offer limited filter functions like Kalaydo/Ebay.
