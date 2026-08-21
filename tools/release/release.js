/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import fetch from 'node-fetch';
import chalk from 'chalk';
import semver from 'semver';
import { fileURLToPath } from 'url';

/**
 * Release Tool for Fredy
 *
 * This tool automates the process of creating a GitHub release. It fetches the previous release,
 * compares it with the current branch, allows manual editing of commit messages, and creates a new
 * release on GitHub.
 *
 * Two modes:
 *   yarn release      stable release, tagged with the package.json version, cut from master
 *   yarn release:pre  pre-release, tagged <version>-pre.<n>, cut from develop
 *
 * Add --dry-run to either one to see the tag, the diff base and the notes without touching GitHub.
 */

/* eslint-disable no-console */

// Define __dirname for ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration and Paths
const CONFIG_PATH = path.join(__dirname, 'config.json');
const PACKAGE_JSON_PATH = path.join(__dirname, '../../package.json');
const REPO = 'orangecoding/fredy';
const PRE_BRANCH = 'develop';

const isPre = process.argv.includes('--pre');
const isDryRun = process.argv.includes('--dry-run');

/**
 * Main function to execute the release process
 */
async function createRelease() {
  try {
    console.log(chalk.cyan(`🚀 Starting ${isPre ? 'pre-release' : 'release'} process...`));

    // 1. Load Configuration
    if (!fs.existsSync(CONFIG_PATH)) {
      console.error(chalk.red('❌ Error: config.json not found in tools/release/'));
      process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const githubToken = config.github_token;

    if (!githubToken) {
      console.error(chalk.red('❌ Error: GitHub token not configured.'));
      process.exit(1);
    }

    // 2. Get current version from package.json
    const packageJson = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const version = packageJson.version;

    if (semver.valid(version) == null) {
      console.error(chalk.red(`❌ Error: version "${version}" in package.json is not valid semver.`));
      process.exit(1);
    }

    // 3. Determine the tag to create and the tag to diff against
    let tag;
    let previousTag;

    if (isPre) {
      ensureReleasableFromPreBranch();

      const releases = await fetchReleases(githubToken);
      ensureVersionIsUnreleased(version, releases);
      tag = nextPreTag(version, releases);

      // /releases/latest skips prereleases, so using it here would make every pre-release list all
      // commits since the last *stable* one. The list endpoint is sorted newest first and includes
      // prereleases, so releases[0] is whatever was cut last - stable or pre.
      previousTag = releases.length > 0 ? releases[0].tag_name : null;
    } else {
      tag = version;
      previousTag = await fetchLatestStableTag(githubToken);
    }

    console.log(chalk.blue(`📦 Target version: ${version}`));
    console.log(chalk.blue(`🏷️  Target tag: ${tag}`));

    if (previousTag == null) {
      console.error(chalk.red('❌ Error: no previous release found to diff against.'));
      process.exit(1);
    }

    console.log(chalk.green(`✅ Previous release found: ${previousTag}`));

    // 4. Check if release already exists
    console.log(chalk.yellow('🔍 Checking if release already exists...'));
    const existingReleaseResponse = await github(`/releases/tags/${tag}`, githubToken);

    if (existingReleaseResponse.status === 200) {
      console.error(chalk.red(`❌ Error: A release with tag ${tag} already exists.`));
      process.exit(1);
    }

    // 5. Ensure the previous tag is available locally
    console.log(chalk.yellow(`📡 Fetching tag ${previousTag} from remote...`));
    try {
      execSync(`git fetch origin tag ${previousTag} --no-tags`);
    } catch (error) {
      console.error(chalk.red(`❌ Error fetching tag ${previousTag} from origin.`));
      console.error(error.message);
      // We don't exit here, maybe it's already there but fetch failed for some reason
    }

    // 6. Get commit messages between previous tag and current HEAD
    console.log(chalk.yellow(`Git diff: ${previousTag} .. HEAD`));
    let commitMessages;
    try {
      commitMessages = execSync(`git log ${previousTag}..HEAD --pretty=format:"- %s"`).toString().trim();
    } catch (error) {
      console.error(chalk.red('❌ Error running git log. Make sure the previous tag is available locally.'), error);
      process.exit(1);
    }

    if (!commitMessages) {
      console.log(chalk.magenta('⚠️  No new commits found since last release.'));
      commitMessages = '- No changes recorded';
    }

    if (isDryRun) {
      console.log(chalk.cyan('\n🧪 Dry run - nothing was created on GitHub.'));
      console.log(chalk.blue(`   Tag:         ${tag}`));
      console.log(chalk.blue(`   Diff base:   ${previousTag}`));
      console.log(chalk.blue(`   Target:      ${isPre ? PRE_BRANCH : 'default branch'}`));
      console.log(chalk.blue(`   Pre-release: ${isPre}`));
      console.log(chalk.blue('   Notes:'));
      console.log(commitMessages);
      return;
    }

    // 7. Open commit messages in editor for manual adjustment
    const tempFilePath = path.join(__dirname, 'CHANGELOG_EDIT.tmp');
    const initialContent = `# Release Notes for ${tag}\n# Edit the messages below. Lines starting with # will be ignored.\n\n${commitMessages}`;
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
    console.log(chalk.cyan(`🚀 Creating ${isPre ? 'pre-release' : 'release'} ${tag} on GitHub...`));
    const createResponse = await github('/releases', githubToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tag_name: tag,
        name: tag,
        body: editedContent,
        draft: false,
        prerelease: isPre,
        // Without this GitHub tags the default branch (master), which is not where a pre-release lives.
        ...(isPre ? { target_commitish: PRE_BRANCH } : {}),
      }),
    });

    if (createResponse.status === 201) {
      const data = await createResponse.json();
      console.log(chalk.green(`🎉 ${isPre ? 'Pre-release' : 'Release'} successfully created!`));
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
 * Thin wrapper around the GitHub repo API
 * @param {string} endpoint path relative to /repos/<owner>/<repo>
 * @param {string} token
 * @param {object} options additional fetch options
 */
function github(endpoint, token, options = {}) {
  return fetch(`https://api.github.com/repos/${REPO}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github.v3+json',
      ...(options.headers || {}),
    },
  });
}

/**
 * All releases, newest first, prereleases included
 * @param {string} token
 */
async function fetchReleases(token) {
  console.log(chalk.yellow('📡 Fetching releases from GitHub...'));
  const response = await github('/releases?per_page=100', token);

  if (!response.ok) {
    console.error(chalk.red('❌ Error fetching releases.'));
    console.error(chalk.red(JSON.stringify(await response.json())));
    process.exit(1);
  }

  return response.json();
}

/**
 * Tag of the latest stable release (this endpoint ignores prereleases)
 * @param {string} token
 */
async function fetchLatestStableTag(token) {
  console.log(chalk.yellow('📡 Fetching latest release from GitHub...'));
  const response = await github('/releases/latest', token);

  if (!response.ok) {
    console.error(chalk.red('❌ Error fetching latest release.'));
    console.error(chalk.red(JSON.stringify(await response.json())));
    process.exit(1);
  }

  return (await response.json()).tag_name;
}

/**
 * A pre-release announces a version that is still coming, so <version>-pre.n sorts *below*
 * <version>. Cutting one for a version that is already out would produce a tag that looks older
 * than the release it is supposed to precede - package.json needs bumping first.
 * @param {string} version
 * @param {Array<{tag_name: string, prerelease: boolean}>} releases
 */
function ensureVersionIsUnreleased(version, releases) {
  const released = releases.find((release) => release.tag_name === version && !release.prerelease);

  if (released != null) {
    console.error(chalk.red(`❌ Error: ${version} has already been released as a stable version.`));
    console.error(chalk.red(`   ${version}-pre.x would sort below it. Bump the version in package.json first.`));
    process.exit(1);
  }
}

/**
 * Next free <version>-pre.<n> tag for the current package.json version
 * @param {string} version
 * @param {Array<{tag_name: string}>} releases
 */
function nextPreTag(version, releases) {
  const pattern = new RegExp(`^${version.replace(/\./g, '\\.')}-pre\\.(\\d+)$`);
  const highest = releases
    .map((release) => pattern.exec(release.tag_name))
    .filter((match) => match != null)
    .reduce((max, match) => Math.max(max, Number(match[1])), 0);

  const tag = `${version}-pre.${highest + 1}`;

  if (semver.valid(tag) == null) {
    console.error(chalk.red(`❌ Error: computed tag "${tag}" is not valid semver.`));
    process.exit(1);
  }

  return tag;
}

/**
 * A pre-release is created with target_commitish: develop, so GitHub tags whatever origin has.
 * Cutting one from another branch, or from a develop that has not been pushed, would produce a
 * release that does not contain the commits that were just tested.
 */
function ensureReleasableFromPreBranch() {
  const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

  if (branch !== PRE_BRANCH) {
    console.error(chalk.red(`❌ Error: pre-releases must be cut from "${PRE_BRANCH}", but you are on "${branch}".`));
    process.exit(1);
  }

  try {
    execSync(`git fetch origin ${PRE_BRANCH}`, { stdio: 'ignore' });
  } catch (error) {
    console.error(chalk.red(`❌ Error fetching ${PRE_BRANCH} from origin.`));
    console.error(error.message);
    process.exit(1);
  }

  const local = execSync('git rev-parse HEAD').toString().trim();
  const remote = execSync(`git rev-parse origin/${PRE_BRANCH}`).toString().trim();

  if (local !== remote) {
    console.error(
      chalk.red(
        `❌ Error: local ${PRE_BRANCH} (${local.slice(0, 7)}) differs from origin/${PRE_BRANCH} (${remote.slice(0, 7)}).`,
      ),
    );
    console.error(chalk.red('   Push or pull first, otherwise the release would point at a different commit.'));
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
