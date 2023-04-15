<img src="https://github.com/orangecoding/fredy/blob/master/doc/logo.png" width="400">  

![Build Status](https://github.com/orangecoding/fredy/actions/workflows/test.yml/badge.svg)

Searching an apartment in Germany can be a frustrating task. Not any longer though, as _Fredy_ will take over and will only notify you once new listings have been found that match your requirements.

_Fredy_ scrapes multiple services (Immonet, Immowelt etc.) and send new listings to you once they become available. The list of available services can easily be extended. For your convenience, _Fredy_ has a UI to help you configure your search jobs.   

If _Fredy_ finds matching results, it will send them to you via Slack, Email, Telegram etc. (More adapters can be configured.) As _Fredy_ stores the listings it has found, new results will not be sent to you twice (and as a side-effect, _Fredy_ can show some statistics). Furthermore, _Fredy_ checks duplicates per scraping so that the same listings are not being sent twice or more when posted on various platforms (which happens more often than one might think).

# Sponsorship [![](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/orangecoding)    
If you like my work, consider becoming a sponsor. I'm not expecting anybody to pay for _Fredy_ or any other Open Source Project I'm maintaining, however keep in mind, I'm doing all of this in my spare time :) Thanks.

<img src="https://github.com/orangecoding/fredy/blob/master/doc/jetbrains.png" width="200">   

_Fredy_ is supported by JetBrains under Open Source Support Program

## Usage  

- Make sure to use Node.js 16 or above
- Run the following commands:
```ssh
yarn (or npm install)
yarn run prod
yarn run start
```
_Fredy_ will start with the default port, set to `9998`. You can access _Fredy_ by opening your browser at `http://localhost:9998`. The default login is `admin`, both for username and password. You should change the password as soon as possible when you plan to run Fredy on a server.

<p align="center">
  <img alt="Job Configuration" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot1.png" width="30%">
&nbsp; &nbsp; &nbsp; &nbsp;
  <img alt="Job Analytics" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot_2.png" width="30%">
&nbsp; &nbsp; &nbsp; &nbsp;  
  <img alt="Job Overview" width="30%" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot_3.png">
</p>
<p align="center">

</p>

## Understanding the fundamentals
There are 3 important parts in Fredy, that you need to understand to leverage the full power of _Fredy_.

#### Provider
_Fredy_ supports multiple services. Immonet, Immowelt and Ebay are just a few examples. Those services are called providers within _Fredy_. When creating a new job, you can choose one or more providers.
A provider contains the URL that points to the search results for the respective service. If you go to immonet.de and search for something, the displayed URL in the browser is what the provider needs to do its magic.
**It is important that you order the search results by date, so that _Fredy_ always picks the latest results first!**

#### Adapter
_Fredy_ supports multiple adapters, such as Slack, SendGrid, Telegram etc. A search job can have as many adapters as supported by _Fredy_. Each adapter needs different configuration values, which you have to provide when using them. A adapter dictactes how the frontend renders by telling the frontend what information it needs in order to send listings to the user.

#### Jobs
A Job wraps adapters and providers. _Fredy_ runs the configured jobs in a specific interval (can be configured in `/conf/config.json`).

## Creating your first job
To create your first job, click on the button "Create New Job" on the job table. The job creation dialog should be self-explanatory, however there is one important thing.
When configuring providers, before copying the URL from your browser, make sure that you have sorted the results by date to make sure _Fredy_ always picks the latest results first.

## User management
As an administrator, you can create, edit and remove users from _Fredy_. Be careful, each job is connected to the user that has created the job. If you remove the user, their jobs will also be removed.

# Development

### Running Fredy in development mode
To run _Fredy_ in development mode, you need to run the backend & frontend separately.
Start the backend with:
```shell
yarn run start
```
For the frontend, run:
```shell
yarn run dev
```
You should now be able to access _Fredy_ from your browser. Check your Terminal to see what port the frontend is running on.

### Running Tests
To run the tests, run
```shell
yarn run test
```

# Architecture
![Architecture](/doc/architecture.jpg "Architecture")

### Immoscout / Immonet
I have added **experimental** support for Immoscout and Immonet. They both are somewhat special, because they have decided to secure their service from bots using Re-Capture. Finding a way around this is barely possible. For _Fredy_ to be able to bypass this check, I'm using a service called [ScrapingAnt](https://scrapingant.com/). The trick is to use a headless browser, rotating proxies and (once successfully validated) to re-send the cookies each time.

To be able to use Immoscout / Immonet, you need to create an account at ScrapingAnt. Configure the API key in the "General Settings" tab (visible when logged in as administrator).
The rest will be handled by _Fredy_. Keep in mind, the support is experimental. There might be bugs and you might not always pass the re-capture check, but most of the time it works rather well :)

If you need more than the 1000 API calls allowed per month, I'd suggest opting for a paid account... ScrapingAnt loves OpenSource, therefore they have decided to give all _Fredy_ users a 10% discount by using the code **FREDY10** (Disclaimer: I do not earn any money for recommending their service).

### Contribution guidelines  

See [Contributing](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTING.md)

# Docker   
Use the Dockerfile in this repository to build an image.  

Example: `docker build -t fredy/fredy /path/to/your/Dockerfile`  

Or use docker-compose:

Example `docker-compose build`

Or use the container that will be built automatically.

`docker pull ghcr.io/orangecoding/fredy:master`

## Create & run a container  

Put your config.json into a path of your choice, such as `/path/to/your/conf/`.

Example: `docker create --name fredy -v /path/to/your/conf/:/conf -p 9998:9998 fredy/fredy`

## Logs  

You can browse the logs with  `docker logs fredy -f`.
