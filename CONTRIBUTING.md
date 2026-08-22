# Contributing

If you want to contribute, please make sure you've executed the tests.

### How to write new provider?

- create the provider file under `/lib/provider`
- create a test under `/test/provider` and make sure it runs successfully

Fredy is ESM only, so use `import`/`export`, never `require`/`exports`.

**Providers must be stateless.** Nothing that belongs to a single run may live at module scope:
two jobs can execute at the same time (a manual run started while the scheduler is working), and
shared mutable state lets the second run overwrite the first one's URL and blacklist mid-run. That
is why the run specific values are handed out by `createConfig()` instead of being assigned onto a
shared object.

```javascript
import { isOneOf } from '../utils.js';

//normalize incoming values into the shape the pipeline works with
function normalize(o) {
  const id = parseInt(o.id.substring(o.id.indexOf('_') + 1, o.id.length));

  return Object.assign(o, { id });
}

//apply the blacklist of this run. Taken as an argument, never read from module scope.
function applyBlacklist(o, blacklist) {
  const titleNotBlacklisted = !isOneOf(o.title, blacklist);
  const descNotBlacklisted = !isOneOf(o.description, blacklist);

  return titleNotBlacklisted && descNotBlacklisted;
}

//the static template. `url` stays null here and there is no bound `filter`.
const config = {
  url: null,
  //fields a listing must have to be usable at all
  requiredFieldNames: ['id', 'title', 'link'],
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
  //appended to the search url so the newest listings come first
  sortByDateParam: 'sorting=2',
  normalize,
};

//called once per job run, returns a fresh config carrying this run's url and blacklist
export const createConfig = (sourceConfig, blacklist = []) => ({
  ...config,
  enabled: sourceConfig.enabled,
  url: sourceConfig.url,
  filter: (listing) => applyBlacklist(listing, blacklist ?? []),
});

export const metaInformation = {
  name: 'your provider name',
  baseUrl: 'https://www.yourprovider.de/',
  id: 'yourprovider',
  //required. Which countries this provider covers, as ISO 3166-1 alpha-2, lowercase.
  countries: ['de'],
};

export { config };
```

**`countries` is required.** Every provider declares it, including the German ones. Three things
read it: the geocoder, which asks Nominatim to search within those countries; the map, whose
`maxBounds` is the union of their bounding boxes; and the job form, which puts the matching flag in
front of the provider's name. Get it wrong and addresses silently fail to resolve, so this is worth
a second look. A provider spanning several countries lists them all:
`countries: ['de', 'at', 'ch']`.

`test/provider/providerMetaInformation.test.js` fails the build when the field is missing or
malformed, so a mistake here does not reach a release.

A country new to Fredy needs one thing adding: its bounding box in
`ui/src/components/map/countryBounds.js`. Without it the map ignores the code and stays where it
was. The flag in the job form needs nothing - it is computed from the code itself, and a provider
covering two countries shows both.

The picker orders providers by country and then by size, from
`ui/src/services/providerOrder.js`. A new provider needs no entry there: it sorts alphabetically
behind the ranked ones of its own country. Add it to `PROVIDER_SIZE_ORDER` only if it belongs
somewhere specific. A country new to `COUNTRY_ORDER` sorts behind the ones already listed.

The same shape is where anything else that varies by country belongs. `currency` is the obvious
next one and is deliberately not implemented: `€` appears in around forty places, twelve of them in
the finance module, which assumes considerably more than a symbol, and three locale files carry it
inside translated strings. Whoever arrives with a provider quoting in kroner should add
`currency: 'DKK'` here, default it to `EUR`, and resolve it exactly the way `countries` is
resolved in `lib/services/providers/`.

### How to write new notification adapter?

An **adapter** is the integration itself (Slack, Telegram, ntfy, ...). What a user creates in the
UI is a **notification channel**: one saved, filled-in configuration of an adapter, reusable across
jobs. You write adapters, Fredy takes care of the channels built on top of them.

- create the adapter file under `/lib/notification/adapter`
- create a description under `/lib/notification/adapter/*.md`. Make sure the name of the md file
  matches the adapter file
- add tests under `/test/notification`

The `fields` of an adapter dictate how the channel form is rendered in the frontend. Two flags on
them are read declaratively by both the UI and the API, so neither needs code per adapter:

- `secret: true` marks a credential. It is never sent to anyone who may not edit the channel, and
  is masked in the form. Every token, password, API key and webhook URL needs it.
- `target: true` marks the one field naming the destination. It fills the "Destination" column of
  the channel list.

`sendPriceChange` is optional. Without it, a price change is delivered through `send` instead.

```javascript
import Slack from 'slack';
import { readAdapterReadme } from '../../services/markdown.js';

//you always get serviceName, newListings, the values of the channel that is being notified
//(shaped by config.fields below), the job key and Fredy's own base url
export const send = ({ serviceName, newListings, notificationConfig, jobKey, baseUrl }) => {
  const { token, channel } = notificationConfig.find((a) => a.id === config.id).fields;

  //settle rather than reject, so one failing message cannot swallow the rest
  return Promise.allSettled(
    newListings.map((listing) => {
      //do whatever it takes to deliver this, and keep the format human readable
    }),
  );
};

export const config = {
  id: 'slack',
  name: 'someUniqueName, used in the frontend',
  //this readme is rendered in the frontend to explain how to use this
  readme: readAdapterReadme('slack.md'),
  description: 'Some description text rendered on the notification channel form',
  fields: {
    token: {
      //type can be text/number/boolean
      type: 'text',
      label: 'Token',
      description: 'The token needed to send notifications to slack.',
      //a credential: never leaves the server for anyone who may not edit this channel
      secret: true,
    },
    channel: {
      type: 'channel',
      label: 'Channel',
      description: 'The channel where fredy should send notifications to.',
      //shown as the channel's destination in the UI
      target: true,
    },
  },
};
```

#### Running Tests

If you've written a new provider you are an awesome person. If you now write tests for it, you are even more awesome. And who doesn't want to be more awesome, right?

#### Codestyle

I'm using ESLint to maintain quote style and quality. Do not skip it...

##### To-do before merging:

- Have you executed the tests? (`yarn test:offline`, or `yarn test` to hit the live providers)
- Are you sure the changes are useful for everybody? Or is it maybe a custom modification just for your case?

_Thanks!_ :heart:
