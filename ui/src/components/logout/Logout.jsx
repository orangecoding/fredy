/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { xhrPost } from '../../services/xhr';
import { releasePushOnLogout } from '../../services/push/webPushClient.js';

/**
 * End the session and start over at the login screen.
 *
 * This used to be a button of its own, painted in the error colour with an error-coloured border,
 * standing in the sidebar's footer next to three other controls in three other idioms. Red means
 * "this figure is over what you can afford" everywhere else in this application, and signing out is
 * not a verdict. What is left is the part that was ever specific to it: the request, and the reload
 * that sends the app back through the login screen because the store still holds the old session's
 * answers.
 *
 * This device's push subscription goes first, while the session can still delete it: push belongs
 * to the user, not the session, so it keeps arriving after a session expires, and signing out on
 * purpose is the one moment a device should stop receiving the account's listings.
 *
 * @returns {Promise<void>}
 */
export default async function logout() {
  await releasePushOnLogout();
  await xhrPost('/api/login/logout');
  location.reload();
}
