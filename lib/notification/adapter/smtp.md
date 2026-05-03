### SMTP Adapter

Send notifications through any SMTP server using [Nodemailer](https://nodemailer.com/).
This works with Gmail, Outlook, self-hosted mail servers, or any provider that supports SMTP.

Setup:

- Provide the SMTP host and port of your mail server.
- For **SSL/TLS** (port 465), set Secure to `true`.
- For **STARTTLS** (port 587), leave Secure empty or set it to `false`.
- Enter the username and password for authentication. For Gmail, use an [App Password](https://support.google.com/accounts/answer/185833).
- Set the sender email address (must be allowed by your SMTP server).

Multiple recipients:

- Separate email addresses with commas (e.g., `some@email.com`, `someOther@email.com`).

Common SMTP settings:

- **Gmail** - `smtp.gmail.com`, port 587, secure: false
- **Outlook** - `smtp.office365.com`, port 587, secure: false
- **Yahoo** - `smtp.mail.yahoo.com`, port 465, secure: true
- **Gmx** - `mail.gmx.net`, port 587, secure: true
