Newer release changelog see https://github.com/orangecoding/fredy/releases

------------

###### [V5.5.0]
- Upgrading dependencies
- fixing provider
- allow multiple instances of 1 provider  
- __BREAKING__: Minimum node version is now 16

###### [V5.4.6]
- Adding Instana node.js monitoring
- 
###### [V5.4.5]
- Adding Instana node.js monitoring 

###### [V5.4.4]
- Add support for Immo Südwest Presse (immo.swp.de)
- Telegram: Use job name instead of ID and link in title
- Fix race condition if user ID is in session but not in user store
- Allow visiting the original provider URL

###### [V5.4.3]
- re-writing readme
- improving docker build
- using github's actions to build docker and test automatically

###### [V5.4.2]
- Fixing prod build

###### [V5.4.1]
- Upgrading dependencies
- Provider urls are now automagically been changed to include the correct sort order for search results

```
Note: It has been an point of confusion since the very beginning of Fredy, that people simply copied the url, but
did not take care of sorting the search results by date. If this is not done, Fredy will most likely not see the latest
results, thus cannot report them. This release fixes it by adding the necessary params (or replaces them).
```

###### [V5.3.0]
- Upgrading dependencies
- It's now possible to send mails to multiple receiver using comma separation for MailJet & Sendgrid
- Fixing Immowelt scraping

###### [V5.2.0]
- Upgrading dependencies
- Adding new similarity check layer (Duplicates are being removed now)
- Adding paging for search results

###### [V5.1.0]
- Upgrading dependencies
- NodeJS 12.13 is now the minimum supported version
- Adding general settings as new configuration page to ui
- Adding new feature working hours

###### [V5.0.0]
- Upgrading dependencies
- NodeJS 12 is now the minimum supported version

###### [V4.0.0]
Bringing back Immoscout :tada:

###### [V3.0.0]
This is basically a re-write, your old config file will not be compatible anymore. Please re-created your search jobs
on the new ui and use the values from your previous config file if needed.
```
- We're getting rid of manual config changes, Fredy, now ships with a UI so that it's easy for you to create and edit jobs
```

###### [V2.0.0]
```
- Fredy can now run multiple search job on one instance
- Changed lot's of the structure of Fredy to make this happen
[BREAKING CHANGES]
- The config has been changed, the config of V1.x will not work any longer
- Sources have been renamed to provider
```
