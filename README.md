<img src="https://github.com/orangecoding/fredy/blob/master/doc/logo.png" width="400">  

[![Build Status](https://travis-ci.org/orangecoding/fredy.svg?branch=master)](https://travis-ci.org/orangecoding/fredy)

Searching an apartment in Germany can be quite frustrating. Not any longer as Fredy will take over and only notifies you once new listings have been found that matches your requirements.

_Fredy_ scrapes multiple services (Immonet, Immowelt etc.) and send new listings to you once they appear. The list of available services can easily be extended. For your convenience, a ui helps you to configure your search jobs.   

If _Fredy_ found matching results, it will send them to you via Slack, Email, Telegram etc. (More adapter possible.) As _Fredy_ will store the listings it has found, new results will not be sent twice (and as a side-effect, _Fredy_ can show some statistics..). Furthermore, _Fredy_ checks duplicates per scraping so that the same listings are not being sent when posted on various platforms. (Happens more often than one might think)

## Usage  

- Make sure to use NodeJs 12 and above
- Run the following commands
```ssh
yarn (or npm install)
yarn run prod
yarn run start
```
_Fredy_ will start with the default port, set to `9998`. You can access _Fredy_ by opening a browser `http://localhost:9998`. The default login is `admin` both for username and password. (You should change the password asap when you plan to run Fredy on your server.)

<p align="center">
  <img alt="Job Configuration" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot__1.png" width="30%">
&nbsp; &nbsp; &nbsp; &nbsp;
  <img alt="Job Analytics" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot2.png" width="30%">
&nbsp; &nbsp; &nbsp; &nbsp;  
  <img alt="Job Overview" width="30%" src="https://github.com/orangecoding/fredy/blob/master/doc/screenshot3.png">
</p>
<p align="center">

</p>

## Immoscout
I have added **experimental** support for Immoscout. Immoscout is somewhat special, coz they have decided to secure their service from bots using Re-Capture. Finding a way around this is barely possible. For _Fredy_ to be able to bypass the check, I'm using a service called [ScrapingAnt](https://scrapingant.com/). The trick is to use a headless browser, rotating proxies and (once successful validated) re-send the cookies each time.

To be able to use Immoscout, you need to create an account at ScrapingAnt. Configure the ApiKey in the "General Settings" tab (visible when logged in as administrator).
The rest should be done by _Fredy_. Keep in mind, the support is experimental. There might be bugs and you might not always get pass the re-capture check, but most of the time it works pretty good :)

If you need more that the 1000 api calls you can do per month, I'd suggest opting for a paid account... ScrapingAnt loves OpenSource, therefor they've decided to give all _Fredy_ users a 10% discount by using the code **FREDY10** (No I don't get any money for recommending good services...)


## Understanding the fundamentals
There are 3 important parts in Fredy, that you need to understand leveraging the full power of _Fredy_.

#### Adapter
_Fredy_ supports multiple services. Immonet, Immowelt and Ebay are just a few. Those services are called adapter within _Fredy_. When creating a new job, you can choose 1 or many adapter.    
An adapter holds the url that points to the search results for the service. If you go to immonet.de and search for something, the shown url in the browser is what the adapter needs to do it's magic.   
**It is important that you order the search results by date, so that _Fredy_ always picks the latest ones first**

#### Provider
_Fredy_ supports multiple provider. Slack, SendGrid, Telegram etc. A search job can have as many provider as supported by _Fredy_. Each provider needs different configuration values, which you have to provide when using it. A provider itself dictactes how the frontend renders by telling the frontend what information it needs in order to send listings to the user.

#### Jobs
A Job wraps adapter and provider. _Fredy_ runs the configured jobs in a specific interval (can be configured in `/conf/config.json`).

## Creating your first job
To create your first job, click on the button "Create New Job" on the job table. The job creation dialog should be self explanatory, however there's one important thing.
When configuring adapter, before copying the url from your browser make sure that you have sorted the results by date to make sure _Fredy_ always picks the latest results first.

## User management
As an administrator, you can create/edit and remove user from _Fredy_. Be careful, each job is connected to the user that has created the job. If you remove the user, the jobs will also be removed.


# Development

### Running Fredy in dev mode
To run _Fredy_ in dev mode, you need to run the backend & frontend separately. Run the backend in your favorite IDE, the frontend can be started from the terminal.
```shell
yarn run dev
```
You should now be able to access _Fredy_ with your browser. Go to `http://localhost:9000`

### Running Tests
To run the tests, simply run
```shell
yarn run test
```

# Architecture
![Architecture](/doc/architecture.jpg "Architecture")

## Immoscout 
I have added EXPERIMENTAL support for Immoscout. Immoscout is somewhat special, coz they have decided to secure their service from bots using Re-Capture. Finding a way
around this is barely possible. For _Fredy_ to be able to bypass the check, I'm using a service called [ScrapingAnt](https://scrapingant.com/).

To be able to use Immoscout, you need to create an account and copy the apiKey into the config file under /conf/config.json.
The rest should be done by _Fredy_. Keep in mind, the support is experimental. There might be bugs and you might not always get pass the re-capture check, but most of the time
it works pretty good :)

If you need more that the 1000 api calls you can do per month, I'd suggest opting for a paid account... (No I don't get any money for recommending good service)

#### Contribution guidelines  

See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md)  

# Docker   
Use the Dockerfile in this Repository to build an image.  

Example: `docker build -t fredy/fredy /path/to/your/Dockerfile`  

Or use docker-compose:

Example `docker-compose build`

## Create & run a container  

Put your config.json to `/path/to/your/conf/`

Example: `docker create --name fredy -v /path/to/your/conf/:/conf -p 9998:9998 fredy/fredy`

## Logs  

You can browse the logs with  `docker logs fredy -f`  
