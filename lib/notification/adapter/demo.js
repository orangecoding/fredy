/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { readAdapterReadme } from '../../services/markdown.js';

export const send = () => {
  //no-op
};
/**
 * The demo instance must not emit notifications of any kind, price changes included.
 * @returns {void}
 */
export const sendPriceChange = () => {
  //no-op
};

export const config = {
  id: 'demo',
  name: 'Demo Adapter',
  description: 'This adapter is for demo purposes and does... well nothing.',
  config: {},
  readme: readAdapterReadme('demo.md'),
};
