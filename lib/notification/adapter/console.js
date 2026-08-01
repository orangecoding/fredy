/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';
import { priceChangeText } from '../priceChangeMessage.js';

export const send = ({ serviceName, newListings, jobKey, baseUrl }) => {
  /* eslint-disable no-console */
  const fredyLinks = baseUrl ? newListings.map((l) => `${baseUrl}/#/listings/listing/${l.id}`).join(', ') : null;
  return [
    Promise.resolve(
      console.info(
        `Found entry from service ${serviceName}, Job: ${jobKey}:`,
        newListings,
        ...(fredyLinks ? [`Open in Fredy: ${fredyLinks}`] : []),
      ),
    ),
  ];
  /* eslint-enable no-console */
};
/**
 * @param {{serviceName: string, priceChanges: any[], jobKey: string, baseUrl: string}} params
 * @returns {Promise<any>[]}
 */
export const sendPriceChange = ({ serviceName, priceChanges, jobKey, baseUrl }) => {
  /* eslint-disable no-console */
  return [
    Promise.resolve(
      console.info(
        `Price change from service ${serviceName}, Job: ${jobKey}:`,
        priceChanges.map((change) => priceChangeText(change, baseUrl)).join('\n\n'),
      ),
    ),
  ];
  /* eslint-enable no-console */
};

export const config = {
  id: 'console',
  name: 'Console',
  description: 'This adapter sends new listings to the console. It is mostly useful for debugging.',
  config: {},
  readme: readAdapterReadme('console.md'),
};
