### SendGrid Adapter

SendGrid is an email delivery service with a generous free tier, which is more than enough for Fredy.

Setup:
- Create a SendGrid account: https://sendgrid.com/
- Decide which email address Fredy should send from (e.g., yourGmailAccount@gmail.com), add it to SendGrid, and complete the verification.
- Create an API key and add it to Fredy's configuration.
- Create a Dynamic Template in SendGrid. You can copy the template from `/lib/notification/emailTemplate/template.hbs`.

Sending to multiple recipients:
- Separate email addresses with commas (e.g., some@email.com, someOther@email.com).
