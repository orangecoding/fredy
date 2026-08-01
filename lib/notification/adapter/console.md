### Console Adapter

The console adapter prints everything found by Fredy to the console (it does not send notifications). This is useful to verify that your search criteria work as expected before enabling a real notification service.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
