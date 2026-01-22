/*
 * Copyright (c) 2026 by Christian Kellner.
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

/* eslint-disable no-console */
async function addCopyright(files) {
  const oldCopyrightRegex =
    /^(\/\*\n \* Copyright \(c\) \d{4} by Christian Kellner\.\n \* Licensed under Apache-2.0 with Commons Clause and Attribution\/Naming Clause\n \*\/\n\n)+/;
  for (let file of files) {
    try {
      let content = await fs.readFile(file, 'utf8');
      const strippedContent = content.replace(oldCopyrightRegex, '');
      const newContent = COPYRIGHT + strippedContent;
      if (content !== newContent) {
        await fs.writeFile(file, newContent);
        console.log(`Added/Updated copyright in ${file}`);
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err}`);
    }
  }
}
/* eslint-enable no-console */

const filesToProcess = process.argv.length > 2 ? process.argv.slice(2) : await getAllFiles();
await addCopyright(filesToProcess);
