### Resend Adapter

Resend is a modern email delivery service that Fredy can use to send notifications.

Setup:
- Create a Resend account: https://resend.com/
- Create an API key and add it to Fredy's configuration.
- Choose the sender address (e.g., you@yourdomain.com). Verify the domain (https://resend.com/domains/) in Resend before using it.
- Optional for local testing: you can use `onboarding@resend.dev`, but Resend may restrict who you can send to when using test domains.

Multiple recipients:
- Separate email addresses with commas (e.g., some@email.com, someOther@email.com).

Notes & Troubleshooting:
- Ensure the `from` address is verified or belongs to a verified domain in Resend.
- If emails don't arrive, check your spam folder and Resend dashboard logs.
- The template displays listing images via their public URLs; make sure images are reachable.
