/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
export function markdown2Html(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}
