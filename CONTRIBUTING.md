# Contributing

If you want to contribute, please make sure you've executed the tests.


### How to write new provider?
- create the provider filer under `/lib/provider`
- create a test under /test and make sure it is running successfully

```javascript
let appliedBlackList = [];

//normalize incoming values
function normalize(o) {
  const id = parseInt(o.id.substring(o.id.indexOf('_') + 1, o.id.length));
  
  return Object.assign(o, { id });
}

//apply blacklist if needed
function applyBlacklist(o) {
  const titleNotBlacklisted = !utils.isOneOf(o.title, appliedBlackList);
  const descNotBlacklisted = !utils.isOneOf(o.description, appliedBlackList);

  return titleNotBlacklisted && descNotBlacklisted;
}

const config = {
  url: null,
    //this is the container wrapping the search listings
  crawlContainer: '#result-list-stage .item',
  crawlFields: {
    id: '@id',
    price: 'div[id*="selPrice_"] | trim',
    size: 'div[id*="selArea_"] | trim',
    title: '.item a img@title',
    link: 'a[id*="lnkImgToDetails_"]@href',
    address: '.item .box-25 .ellipsis .text-100 | removeNewline | trim',
  },
  paginate: '#idResultList .margin-bottom-6.margin-bottom-sm-12 .panel a.pull-right@href',
  normalize: normalize,
  filter: applyBlacklist,
};

//you can basically copy & paste this, as this is to initialize the provider with the values from the db
exports.init = (sourceConfig, blacklist) => {
  config.enabled = sourceConfig.enabled;
  config.url = sourceConfig.url;
  appliedBlackList = blacklist || [];
};

//ths 
exports.metaInformation = {
  name: 'your provider name',
  baseUrl: 'https://www.yourprovider.de/',
  id: __filename.slice(__dirname.length + 1, -3),
};

exports.config = config;

```
 

### How to write new notification adapter?
- create the provider filer under `/lib/notification/adapter`
- create a description of the provider under `/lib/notification/adapter/*.md`. Make sure the name of the md file is equal to the notification adapter

The notification adapter itself dictates how the frontend should be rendered in order to collect all necessary keys.

```javascript
const Slack = require('slack');
const msg = Slack.chat.postMessage;
const { markdown2Html } = require('../../services/markdown');


//as a parameter, you will always get the serviceName, newListings and all the values, that
//you have defined exports.config.fields. (This is being used for rendering in the frontend)
exports.send = ({ serviceName, newListings, notificationConfig, jobKey }) => {
    const { token, channel } = notificationConfig.find((adapter) => adapter.id === 'slack').fields;
    return newListings.map((payload) => {
        //tho whatever needs to be done to send the data to the receiver, make sure the format is human readable
    });
};

exports.config = {
    id: __filename.slice(__dirname.length + 1, -3),
    name: 'someUniqueName, used in the frontend',
    //this readme is rendered in the frontend to explain how to use this
    readme: markdown2Html('lib/notification/adapter/slack.md'),
    description: 'Some description text rendered on the notification page',
    fields: {
        token: {
            //type can be text/number/boolean
            type: 'text',
            label: 'Token',
            description: 'The token needed to send notifications to slack.',
        },
        channel: {
            type: 'channel',
            label: 'Channel',
            description: 'The channel where fredy should send notifications to.',
        },
    },
};

```

#### Running Tests
If you've written a new provider you are an awesome person. You know it and I do. If you now write tests for it, you are even more awesome. And who doesn't want to be more awesome right?

To write tests for provider, you need to use Node 8 as the tests are using `async / await`

#### Codestyle
I'm using Eslint to maintain quote style and quality. Do not skip it...

##### To do before merging:

- executed tests? (`yarn run test`)
- sure the changes are useful for everybody? Or is it maybe a custom modification just for your case?

_Thanks!_ :heart:
