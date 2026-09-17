/**
 * Daily schedule registration (macOS launchd) under Application Support only.
 * User never copies a plist by hand — the app writes + bootstraps.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { ensureDataPlane, logsRoot } from './paths.mjs';

export const PLIST_LABEL = 'com.careerloop.daily';

export function buildPlistXml({ home, hour = 8, minute = 30, programArgs }) {
  const { root, bin } = ensureDataPlane(home);
  const logs = logsRoot(home);
  const prog = programArgs || [
    path.join(bin, 'career-loop-runner'),
    'digest',
    '--catch-up',
  ];
  const argsXml = prog.map((a) => `    <string>${escapeXml(a)}</string>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(root)}</string>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logs, 'daily.stdout.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logs, 'daily.stderr.log'))}</string>
</dict>
</plist>
`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Write catch-up runner + plist under Application Support.
 * On macOS, bootstrap launchd. Elsewhere, document + stub only.
 */
export function registerDailySchedule({
  home = os.homedir(),
  hour = 8,
  minute = 30,
  runnerScript,
  dryRun = false,
} = {}) {
  const { root, bin } = ensureDataPlane(home);
  const logs = logsRoot(home);
  fs.mkdirSync(logs, { recursive: true });

  const runnerPath = path.join(bin, 'career-loop-runner');
  const script = runnerScript || defaultRunnerScript();
  fs.writeFileSync(runnerPath, script, { encoding: 'utf8', mode: 0o755 });

  const plistPath = path.join(root, `${PLIST_LABEL}.plist`);
  const xml = buildPlistXml({
    home,
    hour,
    minute,
    programArgs: ['/bin/bash', runnerPath, 'digest', '--catch-up'],
  });
  fs.writeFileSync(plistPath, xml, 'utf8');

  const result = {
    plistPath,
    runnerPath,
    label: PLIST_LABEL,
    hour,
    minute,
    catch_up_on_wake: true,
    user_copies_plist: false,
    loaded: false,
    detail: '',
  };

  if (dryRun || process.platform !== 'darwin') {
    result.detail = process.platform === 'darwin'
      ? 'dryRun: plist written, launchctl skipped'
      : 'non-macOS: plist + runner written for reference; launchd not available';
    return result;
  }

  // Prefer gui/<uid> bootstrap; fall back to load
  const uid = process.getuid?.() ?? 501;
  const bootout = spawnSync('launchctl', ['bootout', `gui/${uid}/${PLIST_LABEL}`], { encoding: 'utf8' });
  const bootstrap = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, plistPath], { encoding: 'utf8' });
  if (bootstrap.status === 0) {
    result.loaded = true;
    result.detail = 'launchctl bootstrap ok';
  } else {
    const load = spawnSync('launchctl', ['load', '-w', plistPath], { encoding: 'utf8' });
    result.loaded = load.status === 0;
    result.detail = result.loaded
      ? 'launchctl load ok'
      : `bootstrap_exit=${bootstrap.status} load_exit=${load.status} ${(bootstrap.stderr || load.stderr || '').trim()}`;
  }
  void bootout;
  return result;
}

function defaultRunnerScript() {
  return `#!/bin/bash
# Career Loop catch-up runner — lives under Application Support only.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$ROOT/state"
mkdir -p "$STATE" "$ROOT/logs"
STAMP="$STATE/last_success_at"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DAY="$(date +%Y-%m-%d)"
# Catch-up: if we already succeeded today, no-op
if [[ -f "$STAMP" ]]; then
  LAST="$(cut -c1-10 < "$STAMP" || true)"
  if [[ "$LAST" == "$DAY" ]]; then
    echo "{\\"ts\\":\\"$NOW\\",\\"kind\\":\\"catch-up-noop\\",\\"day\\":\\"$DAY\\"}" >> "$ROOT/logs/schedule.log"
    exit 0
  fi
fi
# Marker for v0 stub — desktop app replaces this with a real digest invoke
echo "{\\"ts\\":\\"$NOW\\",\\"kind\\":\\"catch-up-run\\",\\"day\\":\\"$DAY\\",\\"args\\":\\"$*\\"}" >> "$ROOT/logs/schedule.log"
echo "$NOW" > "$STAMP"
`;
}

export function describeScheduleContract() {
  return {
    clock: '08:30 local (launchd uses Mac local timezone)',
    working_directory: '~/Library/Application Support/CareerLoop',
    never: ['Documents', 'Desktop', 'iCloud'],
    catch_up_on_wake: 'RunAtLoad + last_success_at day stamp; one catch-up per missed morning',
    user_action: 'none — app registers launchd; user never copies plist',
  };
}
