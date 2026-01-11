/*
 * Copyright (c) 2025 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs/promises';
import path from 'path';

const COPYRIGHT = `/*
 * Copyright (c) ${new Date().getFullYear()} by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

`;

async function getAllFiles(dir = '.') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let files = [];
  for (let entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      files = files.concat(await getAllFiles(fullPath));
    } else if (fullPath.endsWith('.js') || fullPath.endsWith('.jsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

const COPYRIGHT_PATTERN = /^\/\*\s*\n\s*\*\s*Copyright \(c\) \d{4} by Christian Kellner\./;

/* eslint-disable no-console */
async function addCopyright(files) {
  for (let file of files) {
    try {
      let content = await fs.readFile(file, 'utf8');
      if (!COPYRIGHT_PATTERN.test(content)) {
        await fs.writeFile(file, COPYRIGHT + content);
        console.log(`Added copyright to ${file}`);
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err}`);
    }
  }
}
/* eslint-enable no-console */

const filesToProcess = process.argv.length > 2 ? process.argv.slice(2) : await getAllFiles();
await addCopyright(filesToProcess);
