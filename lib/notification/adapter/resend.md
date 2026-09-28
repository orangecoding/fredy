### Resend Adapter

Resend is a modern email delivery service that Fredy can use to send notifications.

Setup:
- Create a Resend account: https://resend.com/
- Create an API key and add it to Fredy's configuration.
- Choose the sender address (e.g., you@yourdomain.com). Verify the domain (https://resend.com/domains/) in Resend before using it.
- To get a display name in the inbox instead of a bare address, write the sender as `Fredy <you@yourdomain.com>`.
- Optional for local testing: you can use `onboarding@resend.dev`, but Resend may restrict who you can send to when using test domains.

Multiple recipients:
- Separate email addresses with commas (e.g., some@email.com, someOther@email.com).

Notes & Troubleshooting:
- Ensure the `from` address is verified or belongs to a verified domain in Resend.
- If emails don't arrive, check your spam folder and Resend dashboard logs.
- The template displays listing images via their public URLs; make sure images are reachable.

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
