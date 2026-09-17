/**
 * App-support data plane. Never Documents / Desktop / iCloud.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP_NAME = 'CareerLoop';

export function appSupportRoot(home = os.homedir()) {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_NAME);
  }
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, APP_NAME);
  }
  const xdg = process.env.XDG_DATA_HOME || path.join(home, '.local', 'share');
  return path.join(xdg, APP_NAME);
}

export function logsRoot(home = os.homedir()) {
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Logs', APP_NAME);
  }
  return path.join(appSupportRoot(home), 'logs');
}

export function ensureDataPlane(home = os.homedir()) {
  const root = appSupportRoot(home);
  const digests = path.join(root, 'digests');
  const state = path.join(root, 'state');
  const bin = path.join(root, 'bin');
  const logs = logsRoot(home);
  for (const p of [root, digests, state, bin, logs, path.join(root, 'logs')]) {
    fs.mkdirSync(p, { recursive: true });
  }
  return { root, digests, state, bin, logs };
}

export function portalsPath(home = os.homedir()) {
  return path.join(appSupportRoot(home), 'state', 'portals.json');
}

export function loopStatePath(home = os.homedir()) {
  return path.join(appSupportRoot(home), 'state', 'loop.json');
}
