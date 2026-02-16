/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { fileURLToPath } from 'url';

/**
 * Release Tool for Fredy
 *
 * This tool automates the process of creating a GitHub release.
 * It fetches the latest release, compares it with the current master branch,
 * allows manual editing of commit messages, and creates a new release on GitHub.
 */

// Define __dirname for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration and Paths
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PACKAGE_JSON_PATH = path.join(__dirname, '../../package.json');
const REPO = 'orangecoding/fredy';
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const GITHUB_TOKEN = config.github_token;

/**
 * Main function to execute the release process
 */
async function createRelease() {
  /* eslint-disable no-console */
  try {
    console.log(chalk.cyan('🚀 Starting release process...'));

    // 1. Load Configuration
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(chalk.red('❌ Error: config.json not found in tools/release/'));
      process.exit(1);
    }

    if (!GITHUB_TOKEN) {
      console.error(chalk.red('❌ Error: GitHub token not configured.'));
      process.exit(1);
    }

    // 2. Get current version from package.json
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const version = packageJson.version;
    const tag = version; // Using version as tag

    console.log(chalk.blue(`📦 Target version: ${version}`));

    // 3. Check if release already exists
    console.log(chalk.yellow('🔍 Checking if release already exists...'));
    const existingReleaseResponse = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (existingReleaseResponse.status === 200) {
      console.error(chalk.red(`❌ Error: A release with tag ${tag} already exists.`));
      process.exit(1);
    }

    // 4. Fetch latest release to find the starting point for the diff
    console.log(chalk.yellow('📡 Fetching latest release from GitHub...'));
    const latestReleaseResponse = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!latestReleaseResponse.ok) {
      console.error(chalk.red('❌ Error fetching latest release.'));
      const errorData = await latestReleaseResponse.json();
      console.error(chalk.red(JSON.stringify(errorData)));
      process.exit(1);
    }

    const latestRelease = await latestReleaseResponse.json();
    const latestTag = latestRelease.tag_name;
    console.log(chalk.green(`✅ Latest release found: ${latestTag}`));

    // 5. Ensure the latest tag is available locally
    console.log(chalk.yellow(`📡 Fetching tag ${latestTag} from remote...`));
    try {
      execSync(`git fetch origin tag ${latestTag} --no-tags`);
    } catch (error) {
      console.error(chalk.red(`❌ Error fetching tag ${latestTag} from origin.`));
      console.error(error.message);
      // We don't exit here, maybe it's already there but fetch failed for some reason
    }

    // 6. Get commit messages between latest tag and current HEAD
    console.log(chalk.yellow(`Git diff: ${latestTag} .. HEAD`));
    let commitMessages;
    try {
      commitMessages = execSync(`git log ${latestTag}..HEAD --pretty=format:"- %s"`).toString().trim();
    } catch (error) {
      console.error(chalk.red('❌ Error running git log. Make sure the latest tag is available locally.'), error);
      process.exit(1);
    }

    if (!commitMessages) {
      console.log(chalk.magenta('⚠️  No new commits found since last release.'));
      commitMessages = '- No changes recorded';
    }

    // 7. Open commit messages in editor for manual adjustment
    const tempFilePath = path.join(__dirname, 'CHANGELOG_EDIT.tmp');
    const initialContent = `# Release Notes for ${version}\n# Edit the messages below. Lines starting with # will be ignored.\n\n${commitMessages}`;
    fs.writeFileSync(tempFilePath, initialContent);

    console.log(chalk.blue('📝 Opening editor for release notes (using nano or $EDITOR)...'));
    await openInEditor(tempFilePath);

    // 8. Read edited content
    let editedContent = fs
      .readFileSync(tempFilePath, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('#'))
      .join('\n')
      .trim();

    fs.unlinkSync(tempFilePath); // Clean up temp file

    if (!editedContent) {
      console.error(chalk.red('❌ Release notes are empty. Aborting release.'));
      process.exit(1);
    }

    // 9. Create the new release
    console.log(chalk.cyan(`🚀 Creating release ${version} on GitHub...`));
    const createResponse = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tag_name: tag,
        name: version,
        body: editedContent,
        draft: false,
        prerelease: false,
      }),
    });

    if (createResponse.status === 201) {
      const data = await createResponse.json();
      console.log(chalk.green('🎉 Release successfully created!'));
      console.log(chalk.green(`🔗 URL: ${data.html_url}`));
    } else {
      const errorData = await createResponse.json();
      console.error(chalk.red('❌ Failed to create release.'));
      console.error(chalk.red(JSON.stringify(errorData, null, 2)));
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('💥 An unexpected error occurred:'));
    console.error(error);
    process.exit(1);
  }
}

/**
 * Helper to open a file in a terminal editor
 * @param {string} filePath
 */
function openInEditor(filePath) {
  return new Promise((resolve, reject) => {
    const editor = process.env.EDITOR || 'nano';
    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

await createRelease();
/* eslint-enable no-console */
