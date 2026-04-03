# Tasks: Native Proxy Support

- [x] Add `undici` as explicit dependency
- [x] Write `test/services/http/httpClient.test.js` (22 tests)
- [x] Create `lib/services/http/httpClient.js` — central HTTP client
- [x] Write `test/services/extractor/puppeteerExtractor.test.js` (10 tests)
- [x] Wire proxy into `lib/services/extractor/puppeteerExtractor.js`
- [x] Pass proxy config from `jobExecutionService.js` to `launchBrowser()`
- [x] Write `test/services/storage/settingsStorage.test.js` (2 tests)
- [x] Add `clearProxyCache()` call to `settingsStorage.js`
- [x] Update `lib/provider/immoscout.js` — swap fetch to scrapingFetch (3 calls)
- [x] Update `lib/services/listings/listingActiveTester.js` — swap to scrapingFetch (1 call)
- [x] Migrate `lib/services/geocoding/client/nominatimClient.js` to native fetch (not proxied)
- [x] Add Network tab to `GeneralSettings.jsx` with proxy URL input
- [x] All tests pass (`yarn test`)
- [x] Lint passes (`yarn lint`)
