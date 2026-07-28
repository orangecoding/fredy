/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { getDirName } from '../utils.js';
import logger from './logger.js';

/**
 * Read a notification adapter's setup guide.
 *
 * Returns the raw markdown - the frontend renders it with Semi's MarkdownRender. The old name
 * (`markdown2Html`) promised a conversion that never happened, and it took a CWD-relative path
 * resolved while the adapter modules were still being imported, so starting Fredy from anywhere
 * but the repository root threw before a single route existed.
 *
 * A missing or unreadable guide is not worth failing startup over: the adapter simply shows no
 * instructions.
 *
 * @param {string} fileName - File name of the guide, relative to lib/notification/adapter.
 * @returns {string} The markdown source, or an empty string when it cannot be read.
 */
export function readAdapterReadme(fileName) {
  const fullPath = path.join(getDirName(), 'notification', 'adapter', path.basename(fileName));
  try {
    return fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    logger.warn(`Could not read the setup guide "${fileName}".`, error?.message || error);
    return '';
  }
}
