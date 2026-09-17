/**
 * Keyword scan against public ATS / remote boards (class A HTTP).
 * Stub-friendly: if a provider fails, others continue; empty result is OK.
 */
import { createHash } from 'node:crypto';

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return String(url || '').trim();
  }
}

function titleMatches(title, titleFilter = {}) {
  const t = String(title || '').toLowerCase();
  const positives = (titleFilter.positive || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const negatives = (titleFilter.negative || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  if (negatives.some((n) => t.includes(n))) return false;
  if (!positives.length) return true;
  return positives.some((p) => t.includes(p));
}

function locationMatches(location, locationFilter = {}, title = '') {
  const loc = String(location || '').toLowerCase();
  const titleLower = String(title || '').toLowerCase();
  const always = (locationFilter.always_allow || []).map((x) => String(x).toLowerCase());
  const allow = (locationFilter.allow || []).map((x) => String(x).toLowerCase());
  const block = (locationFilter.block || []).map((x) => String(x).toLowerCase());
  if (always.some((a) => a && loc.includes(a))) return true;
  if (block.some((b) => b && loc.includes(b))) return false;
  if (!allow.length) return true;
  if (allow.some((a) => a && loc.includes(a))) return true;
  // Last resort: Remote in title when allow includes remote
  if (allow.includes('remote') && /\bremote\b/.test(titleLower)) return true;
  return false;
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'CareerLoop/0.1 (+local)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function scanRemotive(portals) {
  const data = await fetchJson('https://remotive.com/api/remote-jobs');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    id: `remotive:${j.id}`,
    title: j.title || '',
    company: j.company_name || '',
    location: j.candidate_required_location || 'Remote',
    url: j.url || '',
    provider: 'remotive',
    posted_at: j.publication_date || null,
  })).filter((j) =>
    titleMatches(j.title, portals.title_filter)
    && locationMatches(j.location, portals.location_filter, j.title)
  );
}

async function scanJobicy(portals) {
  const data = await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=50');
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  return jobs.map((j) => ({
    id: `jobicy:${j.id}`,
    title: j.jobTitle || '',
    company: j.companyName || '',
    location: j.jobGeo || 'Remote',
    url: j.url || j.jobUrl || '',
    provider: 'jobicy',
    posted_at: j.pubDate || null,
  })).filter((j) =>
    titleMatches(j.title, portals.title_filter)
    && locationMatches(j.location, portals.location_filter, j.title)
  );
}

async function scanHimalayas(portals) {
  // Public listing endpoint; may rate-limit — fail soft.
  const data = await fetchJson('https://himalayas.app/jobs/api?limit=40');
  const jobs = Array.isArray(data) ? data : (Array.isArray(data?.jobs) ? data.jobs : []);
  return jobs.map((j, i) => ({
    id: `himalayas:${j.slug || j.id || i}`,
    title: j.title || j.jobTitle || '',
    company: j.companyName || j.company?.name || '',
    location: (Array.isArray(j.locationRestrictions) ? j.locationRestrictions.join(', ') : j.location) || 'Remote',
    url: j.applicationLink || j.url || (j.slug ? `https://himalayas.app/jobs/${j.slug}` : ''),
    provider: 'himalayas',
    posted_at: j.pubDate || j.postedAt || null,
  })).filter((j) =>
    j.title
    && titleMatches(j.title, portals.title_filter)
    && locationMatches(j.location, portals.location_filter, j.title)
  );
}

const PROVIDERS = {
  remotive: scanRemotive,
  jobicy: scanJobicy,
  himalayas: scanHimalayas,
};

/**
 * @param {{ portals: object, seenUrls?: Set<string>|string[], dryRun?: boolean }} opts
 */
export async function scan({ portals, seenUrls = [], dryRun = false } = {}) {
  if (!portals || typeof portals !== 'object') {
    throw new Error('scan: portals object is required');
  }
  const seen = new Set(
    (seenUrls instanceof Set ? [...seenUrls] : seenUrls).map(normalizeUrl).filter(Boolean),
  );
  const boards = Array.isArray(portals.job_boards) ? portals.job_boards : [];
  const enabled = boards.filter((b) => b && b.enabled !== false);
  const toRun = enabled.length
    ? enabled
    : [{ name: 'Remotive', provider: 'remotive' }, { name: 'Jobicy', provider: 'jobicy' }];

  const roles = [];
  const errors = [];
  if (dryRun) {
    return { roles: [], errors: [], dryRun: true, providers: toRun.map((b) => b.provider || b.name) };
  }

  for (const board of toRun) {
    const key = String(board.provider || board.name || '').toLowerCase();
    const fn = PROVIDERS[key];
    if (!fn) {
      errors.push({ provider: key, error: 'no_provider_impl' });
      continue;
    }
    try {
      const batch = await fn(portals);
      for (const role of batch) {
        const url = normalizeUrl(role.url);
        if (!url || seen.has(url)) continue;
        seen.add(url);
        roles.push({ ...role, url });
      }
    } catch (err) {
      errors.push({ provider: key, error: String(err?.message || err) });
    }
  }

  roles.sort((a, b) => String(b.posted_at || '').localeCompare(String(a.posted_at || '')));
  return {
    roles,
    errors,
    scanned_at: new Date().toISOString(),
    fingerprint: createHash('sha256').update(JSON.stringify(portals.title_filter || {})).digest('hex').slice(0, 12),
  };
}

export { titleMatches, locationMatches, normalizeUrl };
