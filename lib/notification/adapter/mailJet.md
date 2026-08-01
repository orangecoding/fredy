### Mailjet Adapter

To use [Mailjet](https://mailjet.com), create an account and decide which email address Fredy should send from.

For example, if you use yourGmailAccount@gmail.com, add and verify this address in Mailjet.
Provide your public/private API keys in Fredy's configuration. Fredy uses the same email template as for SendGrid.

To send to multiple recipients, separate email addresses with commas (e.g., some@email.com, someOther@email.com).

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
