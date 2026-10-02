/*
 * Copyright (c) 2026 by Christian Kellner.
 * Licensed under Apache-2.0 with Commons Clause and Attribution/Naming Clause
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

const dockerfile = readFileSync(path.join(projectRoot, 'Dockerfile'), 'utf-8');

const entrypointScript = readFileSync(path.join(projectRoot, 'docker-entrypoint.sh'), 'utf-8');

const parseDockerJsonInstruction = (instruction) => {
  const instructionValue = dockerfile.match(new RegExp(`^${instruction}\\s+(\\[.+\\])\\s*$`, 'm'))?.[1];

  expect(instructionValue, `${instruction} must be defined`).toBeDefined();
  return JSON.parse(instructionValue ?? 'null');
};

const lastDockerUserBefore = (marker) => {
  const markerIndex = dockerfile.search(marker);

  expect(markerIndex, `${marker} must exist in Dockerfile`).toBeGreaterThanOrEqual(0);

  const users = dockerfile.slice(0, markerIndex).match(/^USER\s+\S+\s*$/gm);

  return users?.at(-1);
};

/**
 * Without an init as pid 1 nobody reaps the Chromium helper processes that get
 * reparented when a browser dies, and the container slowly fills up with
 * `<defunct>` entries.
 *
 * Node cannot do the reaping itself (libuv only waits for the pids it spawned),
 * so tini must remain in the process chain as the container's init/subreaper.
 *
 * The Docker ENTRYPOINT is a small wrapper. Started as root, it repairs volume
 * ownership and hands execution to tini after switching to the unprivileged node
 * user. Started with `--user`, it checks the volumes are writable and execs
 * tini directly.
 */
describe('Dockerfile init process', () => {
  it('installs tini', () => {
    expect(dockerfile).toMatch(/apt-get install[\s\S]*?\btini\b/);
  });

  it('copies the startup entrypoint into the image and makes it executable', () => {
    expect(dockerfile).toMatch(/^COPY\s+docker-entrypoint\.sh\s+\/usr\/local\/bin\/docker-entrypoint\.sh\s*$/m);

    expect(dockerfile).toMatch(/^RUN\s+chmod\s+755\s+\/usr\/local\/bin\/docker-entrypoint\.sh\s*$/m);
  });

  it('keeps the final image startup as root so mounted volumes can be fixed', () => {
    expect(lastDockerUserBefore(/^ENTRYPOINT\s/m)).toBe('USER root');
  });

  it('uses the startup script as Docker ENTRYPOINT', () => {
    expect(parseDockerJsonInstruction('ENTRYPOINT')).toEqual(['/usr/local/bin/docker-entrypoint.sh']);

    expect(parseDockerJsonInstruction('CMD')).toEqual(['node', 'index.js']);
  });

  it('only repairs volume ownership when started as root', () => {
    const rootBranch = entrypointScript.indexOf('if [ "$uid" = "0" ]; then');
    const chown = entrypointScript.indexOf('-exec chown -h node:node {} +');
    const exec = entrypointScript.indexOf('exec setpriv');

    expect(rootBranch).toBeGreaterThanOrEqual(0);
    expect(chown).toBeGreaterThan(rootBranch);
    expect(chown).toBeLessThan(exec);
  });

  it('only chowns what node does not own yet, without following symlinks', () => {
    expect(entrypointScript).toMatch(
      /find \/db \/conf \\\( \\! -user node -o \\! -group node \\\) -exec chown -h node:node/,
    );
  });

  it('keeps starting when the ownership cannot be fixed', () => {
    expect(entrypointScript).toMatch(/-exec chown[^\n]*\\\n\s*\|\| echo "WARN:/);
  });

  it("points HOME at node before dropping privileges, since setpriv keeps root's environment", () => {
    const home = entrypointScript.indexOf('export HOME=/home/node');
    const exec = entrypointScript.indexOf('exec setpriv');

    expect(home).toBeGreaterThanOrEqual(0);
    expect(home).toBeLessThan(exec);
  });

  it('drops privileges and runs the application under tini', () => {
    expect(entrypointScript).toMatch(/\bsetpriv\b[\s\S]*?--reuid=node\b[\s\S]*?--regid=node\b/);

    expect(entrypointScript).toContain('--init-groups');

    expect(entrypointScript).toMatch(/\/usr\/bin\/tini\s+-g\s+--\s+"\$@"/);
  });

  it('execs the privilege drop / tini process instead of leaving the shell as pid 1', () => {
    expect(entrypointScript).toMatch(/\bexec\s+setpriv\b[\s\S]*?\/usr\/bin\/tini\s+-g\s+--\s+"\$@"/);
  });

  it('refuses to start as another user when the volumes are not writable', () => {
    const check = entrypointScript.indexOf('find /db /conf \\! -writable');
    const exit = entrypointScript.indexOf('exit 1', check);
    const exec = entrypointScript.lastIndexOf('exec /usr/bin/tini -g -- "$@"');

    expect(check).toBeGreaterThan(entrypointScript.indexOf('exec setpriv'));
    expect(exit).toBeGreaterThan(check);
    expect(exec).toBeGreaterThan(exit);
    expect(entrypointScript).toMatch(/chown -R 1000:1000/);
  });
});
