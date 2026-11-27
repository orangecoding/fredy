### Browser Notifications Adapter

Receive native notifications in your browser, and as Web Push on your phone or computer even while Fredy is closed.

Quick start:
- Enable this adapter on any of your jobs.
- Open **Settings → Notification channels → Push on this device** on every device that should receive them, and click **Enable push**.
- Use **Send test notification** to check that it arrives.

Without push switched on, notifications only appear while Fredy is open in a browser tab (you are asked for permission there once). A device that has the tab open and push switched on shows each listing once, not twice.

### Push without an open tab (Web Push)

- Fredy sends the notifications itself, straight to the browser vendor's push service (Google, Mozilla, Apple). No account, no app and no third-party service is needed, and the push service only sees encrypted data.
- Push requires Fredy to be reached over **HTTPS** (for example behind a reverse proxy). Browsers do not offer push on plain http, except on `localhost`.
- Set **Base URL** in Administration → System to your https address. Apple's push service only accepts an https or e-mail contact; without a Base URL Fredy uses the https address the device subscribed from.
- Tapping a notification opens the listing in Fredy.
- Each device is listed under **Push on this device** with the time of its last push. A device that was reset or unsubscribed disappears from the list on its next push. Signing out removes the current device; a session that simply expires keeps receiving push.
- The key Fredy signs pushes with is created on first use and stored in the database, so it survives restarts and is part of backups.

**iPhone and iPad (iOS / iPadOS 16.4 or later):**
1. Open Fredy in Safari, tap **Share → Add to Home Screen**.
2. Open Fredy from the home screen icon and sign in.
3. Go to **Settings → Notification channels** and tap **Enable push**, then allow notifications.

**Docker / firewalls:** the container needs outgoing HTTPS to the push services, e.g. `fcm.googleapis.com` (Chrome, Edge, Android), `*.push.services.mozilla.com` (Firefox) and `*.push.apple.com` (Safari).

### Price changes

This adapter also reports **price changes** when price tracking is enabled (Settings > Price tracking, off by default). A price change notification carries the old price, the new price and the percentage, and says whether the price went up or down. Changes smaller than the configured threshold are recorded in the listing's price history but are not sent, so rounding noise does not reach you.
