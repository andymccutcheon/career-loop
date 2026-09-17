/**
 * Digest writer + OS notification. Never claims email was sent.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ensureDataPlane, logsRoot } from './paths.mjs';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildSubject({ empty, newCount }) {
  if (empty || !newCount) return 'Career Loop — no new matches today';
  return `Career Loop — ${newCount} new role${newCount === 1 ? '' : 's'} ready`;
}

export function buildMarkdown({ day, newRoles = [], previousRoles = [] }) {
  const lines = [`# Career Loop — ${day}`, ''];
  lines.push('## New roles', '');
  if (!newRoles.length) lines.push('_None today._', '');
  else {
    for (const r of newRoles) {
      lines.push(`- **${r.title}** at ${r.company || 'Unknown'} — ${r.location || ''}`);
      if (r.url) lines.push(`  - ${r.url}`);
    }
    lines.push('');
  }
  lines.push('## Previously surfaced', '');
  if (!previousRoles.length) lines.push('_None yet._', '');
  else {
    for (const r of previousRoles) {
      lines.push(`- **${r.title}** at ${r.company || 'Unknown'} — ${r.location || ''}`);
      if (r.url) lines.push(`  - ${r.url}`);
    }
    lines.push('');
  }
  lines.push('_Saved on your computer. Career Loop does not email this digest on the default path._', '');
  return lines.join('\n');
}

export function buildHtml({ day, newRoles = [], previousRoles = [], subject }) {
  const renderList = (roles, emptyLabel) => {
    if (!roles.length) return `<p><em>${escapeHtml(emptyLabel)}</em></p>`;
    return `<ul>${roles.map((r) => {
      const link = r.url
        ? `<a href="${escapeHtml(r.url)}">${escapeHtml(r.title)}</a>`
        : escapeHtml(r.title);
      return `<li><strong>${link}</strong> at ${escapeHtml(r.company || 'Unknown')} — ${escapeHtml(r.location || '')}</li>`;
    }).join('')}</ul>`;
  };
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${escapeHtml(subject)}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.45;color:#111}
h1{font-size:1.35rem} h2{font-size:1.1rem;margin-top:1.5rem}
.note{color:#555;font-size:0.9rem;margin-top:2rem}
</style></head><body>
<h1>${escapeHtml(subject)}</h1>
<p>Digest for <strong>${escapeHtml(day)}</strong></p>
<h2>New roles</h2>
${renderList(newRoles, 'None today.')}
<h2>Previously surfaced</h2>
${renderList(previousRoles, 'None yet.')}
<p class="note">Saved on your computer. This is not an email.</p>
</body></html>`;
}

export function notifyOs({ title, body }) {
  if (process.platform === 'darwin') {
    const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`;
    const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
    return {
      ok: r.status === 0,
      method: 'osascript',
      detail: r.status === 0 ? 'ok' : (r.stderr || r.stdout || `exit ${r.status}`).trim(),
    };
  }
  const which = spawnSync('bash', ['-lc', 'command -v notify-send'], { encoding: 'utf8' });
  const bin = (which.stdout || '').trim();
  if (!bin) return { ok: false, method: 'none', detail: 'no notifier on this OS' };
  const r = spawnSync(bin, ['-a', 'CareerLoop', title, body], { encoding: 'utf8' });
  return {
    ok: r.status === 0,
    method: 'notify-send',
    detail: r.status === 0 ? 'ok' : (r.stderr || `exit ${r.status}`).trim(),
  };
}

/**
 * Write HTML+MD under digests/, log, and notify — including empty days.
 */
export function writeDigest({
  newRoles = [],
  previousRoles = [],
  day = new Date().toISOString().slice(0, 10),
  home,
} = {}) {
  const { digests, root } = ensureDataPlane(home);
  const empty = newRoles.length === 0;
  const subject = buildSubject({ empty, newCount: newRoles.length });
  const md = buildMarkdown({ day, newRoles, previousRoles });
  const html = buildHtml({ day, newRoles, previousRoles, subject });
  const base = `digest-${day}${empty ? '-empty' : ''}`;
  const htmlPath = path.join(digests, `${base}.html`);
  const mdPath = path.join(digests, `${base}.md`);
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(mdPath, md, 'utf8');

  const body = empty
    ? 'No new matches today. Your digest folder was updated.'
    : `${newRoles.length} new role${newRoles.length === 1 ? '' : 's'} saved. Open your Career Loop digests folder.`;
  const notify = notifyOs({ title: subject, body });

  const logDir = path.join(root, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const entry = {
    ts: new Date().toISOString(),
    method: 'local-folder',
    empty,
    send_when_empty: true,
    claimed_email_sent: false,
    paths: { html: htmlPath, md: mdPath },
    notify: notify.ok ? 'attempted-ok' : 'unavailable-or-failed',
    notify_detail: notify.detail,
    notify_method: notify.method,
  };
  fs.appendFileSync(path.join(logDir, 'delivery.log'), `${JSON.stringify(entry)}\n`, 'utf8');
  // Mirror under Library/Logs on macOS when available
  try {
    const macLogs = logsRoot(home);
    fs.mkdirSync(macLogs, { recursive: true });
    fs.appendFileSync(path.join(macLogs, 'delivery.log'), `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    /* ignore */
  }
  return entry;
}

export function renderDigest(opts) {
  return writeDigest(opts);
}
