<img src="https://github.com/orangecoding/fredy/blob/master/doc/logo.png" width="400">  

[![Build Status](https://travis-ci.org/orangecoding/fredy.svg?branch=master)](https://travis-ci.org/orangecoding/fredy)
  
_Fredy_ scrapes multiple services (Immonet, Immowelt etc.) as often as you want and send new listings to you once they appear. The list of available services can easily be extended. For your convenience, a ui helps you to configure your search jobs.   
  
If _Fredy_ found matching results, it will send them to you via Slack, Email, Telegram etc. (More adapter possible.) As _Fredy_ will store the listings it found, new results will not be sent twice (and as a side-effect, _Fredy_ can show some statistics..)  
  
## Usage  
  
- Make sure to use NodeJs 12 and above
- Run the following commands
```ssh
yarn (or npm install)
yarn run prod
yarn run start
```
_Fredy_ will start with the default port, set to `9998`. You can access _Fredy_ by opening a browser `http://localhost:9998`. The default login is `admin` for username and password. (You should change the password asap when you plan to run Fredy on your server.)

## Understanding the fundamentals
There are 3 important parts in Fredy, that you need to understand to leverage the full power of _Fredy_.

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



#### Contribution guidelines  
  
See [Contribution](https://github.com/orangecoding/fredy/blob/master/CONTRIBUTION.md)  
  
# Docker   
Use the Dockerfile in this Repository to build an image.  
  
Example: `docker build -t fredy/fredy /path/to/your/Dockerfile`  
  
## Create & run a container  
  
Put your config.json to `/path/to/your/conf/`
  
Example: `docker create --name fredy -v /path/to/your/conf/:/conf -p 9988:9988 fredy/fredy`
  
## Logs  
  
You can browse the logs with  `docker logs fredy -f`  
  
