/**
 * Primary action: Turn on Career Loop
 */
import fs from 'node:fs';
import {
  proposeFromAnswers,
  proposeFromResume,
  confirmPortals,
} from './onboarding.mjs';
import { scan } from './scan.mjs';
import { writeDigest } from './digest.mjs';
import { registerDailySchedule } from './schedule.mjs';
import {
  ensureDataPlane,
  portalsPath,
  loopStatePath,
} from './paths.mjs';

function loadSeen(home) {
  const p = loopStatePath(home);
  if (!fs.existsSync(p)) return { seenUrls: [], previousRoles: [], enabled: false };
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { seenUrls: [], previousRoles: [], enabled: false };
  }
}

function saveState(home, state) {
  ensureDataPlane(home);
  fs.writeFileSync(loopStatePath(home), JSON.stringify(state, null, 2), 'utf8');
}

/**
 * @param {{
 *   resumeText?: string,
 *   answers?: object,
 *   portals?: object,
 *   home?: string,
 *   skipScan?: boolean,
 *   skipSchedule?: boolean,
 * }} opts
 */
export async function turnOnCareerLoop(opts = {}) {
  const home = opts.home;
  ensureDataPlane(home);

  let portals = opts.portals;
  let proposal = null;
  if (!portals) {
    if (opts.resumeText) {
      proposal = proposeFromResume(opts.resumeText);
    } else if (opts.answers) {
      proposal = proposeFromAnswers(opts.answers);
    } else {
      throw new Error('turnOnCareerLoop: provide resumeText, answers, or portals');
    }
    portals = confirmPortals(proposal, true);
  }

  fs.writeFileSync(portalsPath(home), JSON.stringify(portals, null, 2), 'utf8');

  const prev = loadSeen(home);
  let scanResult = { roles: [], errors: [], stub: false };
  if (!opts.skipScan) {
    scanResult = await scan({ portals, seenUrls: prev.seenUrls || [] });
  } else {
    scanResult = { roles: [], errors: [], stub: true };
  }

  const newRoles = scanResult.roles || [];
  const digest = writeDigest({
    newRoles,
    previousRoles: prev.previousRoles || [],
    home,
  });

  const seenUrls = [
    ...(prev.seenUrls || []),
    ...newRoles.map((r) => r.url).filter(Boolean),
  ];
  const previousRoles = [
    ...newRoles.map((r) => ({
      title: r.title,
      company: r.company,
      location: r.location,
      url: r.url,
    })),
    ...(prev.previousRoles || []),
  ].slice(0, 200);

  let schedule = null;
  if (!opts.skipSchedule) {
    schedule = registerDailySchedule({ home, dryRun: opts.scheduleDryRun === true });
  }

  const state = {
    enabled: true,
    enabled_at: new Date().toISOString(),
    seenUrls: [...new Set(seenUrls)],
    previousRoles,
    last_scan: {
      at: scanResult.scanned_at || new Date().toISOString(),
      new_count: newRoles.length,
      errors: scanResult.errors || [],
    },
  };
  saveState(home, state);

  return {
    ok: true,
    primary_action: 'Turn on Career Loop',
    proposal,
    portals,
    scan: {
      new_count: newRoles.length,
      errors: scanResult.errors || [],
      providers_stub: Boolean(scanResult.stub),
    },
    digest,
    schedule,
    data_root: ensureDataPlane(home).root,
  };
}

export { proposeFromAnswers, proposeFromResume, confirmPortals };
