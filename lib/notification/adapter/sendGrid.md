### SendGrid Adapter


SendGrid is a free email service (free as in "you cannot send more than 100(Sendgrid) and 200(Mailjet) emails a day"), which is more than enough for Fredy.

To use [SendGrid](https://sendgrid.com/), you need to create an account. You'll need to decided from which email address you want Fredy to send from. E.g. if you use yourGmailAccount@gmail.com, you have to add this to sendgrid and verify it as well.

Lastly you have to create an api-key and feed it into Fredy's config, as well as creating a new dynamic template. For this new template, I recommend copying and pasting the code from the one I have provided under `/lib/notification/emailTemplate/template.hbs`.
