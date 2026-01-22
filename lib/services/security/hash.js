/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import crypto from 'crypto';
export const hash = (x) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');
