/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { markdown2Html } from '../../services/markdown.js';

export const send = ({ serviceName, newListings, jobKey }) => {
  /* eslint-disable no-console */
  return [Promise.resolve(console.info(`Found entry from service ${serviceName}, Job: ${jobKey}:`, newListings))];
  /* eslint-enable no-console */
};
export const config = {
  id: 'console',
  name: 'Console',
  description: 'This adapter sends new listings to the console. It is mostly useful for debugging.',
  config: {},
  readme: markdown2Html('lib/notification/adapter/console.md'),
};
