/**
 * @career-loop/core/onboarding
 *
 * Stranger-path mapping (v0, heuristics only — no LLM):
 *   resume text OR five answers
 *     → plain-language proposal
 *     → confirmed portals object for scan({ portals }).
 *
 * Cold users never write YAML. The product may persist portals.yml later;
 * this module's contract is the in-memory object.
 *
 * Hard-won location rules (Loop, not the coach US-always_allow seed):
 *   - Put "Remote" in `allow`, never `always_allow` (always_allow beats
 *     `block`, so "Remote, India" would leak). confirmPortals enforces this
 *     after overrides: Remote in always_allow is moved to allow, then
 *     always_allow is deleted.
 *   - Never put United States / USA / US / North America in `allow`
 *     (those strings admit onsite US roles). Entries are split first;
 *     if any token is a leak, the entry dies ("US Remote" included).
 *
 * Seniority is recorded on the proposal for later scoring. It is not
 * written as `skip_tiers` or as title_filter gates — scan already treats
 * an empty skip_tiers as "do not classify", and Coach rule 2 says
 * seniority filtering at scan time loses flat-titled roles permanently.
 *
 * Class C (Resend / GitHub / OpenAI / …) is not on this path.
 * Candidate-facing strings never mention Cursor, Claude, /career-ops,
 * or pipeline mode.
 */

/** Country / continent tokens that leak onsite roles if placed in `allow`. */
export const COUNTRY_ALLOW_LEAKS = [
  'united states',
  'united states of america',
  'usa',
  'u.s.a.',
  'u.s.a',
  'u.s.',
  'u.s',
  'us',
  'america',
  'north america',
  'nationwide',
];

/**
 * Default public remote aggregators (class A: Node + public HTTP).
 * Explicit `provider` so boards without careers_url still resolve.
 */
export const DEFAULT_JOB_BOARDS = [
  { name: 'Himalayas', provider: 'himalayas', enabled: true },
  { name: 'Remotive', provider: 'remotive', enabled: true },
  { name: 'Jobicy', provider: 'jobicy', enabled: true },
];

/**
 * Safe junior / non-permanent negatives. Do not add "Contract" (trim
 * gotcha: it blocks Contractor) or "Manager" (flat-titling).
 */
export const DEFAULT_TITLE_NEGATIVES = [
  'Intern',
  'Internship',
  'Coordinator',
  'Assistant',
  'Junior',
  'Entry Level',
  'Apprentice',
  'Freelance',
];

/** Standalone tokens that match almost every posting if used as positives. */
const GENERIC_TITLE_GATES = new Set([
  'director',
  'vp',
  'vice president',
  'head',
  'chief',
  'lead',
  'senior',
  'staff',
  'principal',
  'manager',
  'content',
  'intern',
  'specialist',
  'associate',
  'executive',
  'officer',
]);

const SENIORITY_STRIP = /^(?:director|vp|vice president|head|chief|lead|senior|staff|principal|manager|junior|intern)(?:\s+of)?\s+/i;

const US_STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN',
  texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

const US_STATE_CODES = new Set(Object.values(US_STATE_NAMES));

const MODEST_OFFSHORE_BLOCK = [
  'India',
  'Bengaluru',
  'Bangalore',
  'Hyderabad',
  'Philippines',
];

const FUNCTION_PHRASES = [
  'product marketing',
  'product management',
  'product design',
  'brand strategy',
  'brand marketing',
  'growth marketing',
  'content marketing',
  'performance marketing',
  'developer marketing',
  'developer relations',
  'developer tools',
  'go-to-market',
  'go to market',
  'software engineering',
  'software engineer',
  'machine learning',
  'data science',
  'data engineering',
  'data analytics',
  'site reliability',
  'engineering management',
  'engineering manager',
  'frontend engineering',
  'backend engineering',
  'full stack',
  'fullstack',
  'applied ai',
  'applied science',
  'user research',
  'user experience',
  'strategic finance',
  'financial planning',
  'people operations',
  'revenue operations',
  'marketing operations',
  'sales operations',
  'creator partnerships',
  'influencer marketing',
  'social media',
];

const FUNCTION_TOKENS = [
  'engineering',
  'product',
  'design',
  'marketing',
  'finance',
  'operations',
  'research',
  'analytics',
  'data',
  'security',
  'infrastructure',
  'growth',
];

const FORBIDDEN_FACING = /Cursor|Claude|\/career-ops|pipeline mode|Resend|OpenAI|GitHub/i;

function assertCandidateFacing(text, label) {
  if (typeof text === 'string' && FORBIDDEN_FACING.test(text)) {
    throw new Error(`${label} contains a forbidden candidate-facing token`);
  }
  return text;
}

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => asList(item));
  }
  return String(value)
    .split(/[,;\n|/]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function uniquePreserve(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = String(item).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof item === 'string' ? item.trim() : item);
  }
  return out;
}

/** Split an allow/always_allow entry so "US Remote" is tokens, not one blob. */
export function splitLocationTokens(token) {
  return String(token || '')
    .toLowerCase()
    .replace(/\./g, '')
    .split(/[\s,/|()_-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function keywordList(value) {
  if (value == null) return [];
  const arr = Array.isArray(value) ? value : [value];
  return arr.filter((k) => typeof k === 'string').map((k) => k.trim()).filter(Boolean);
}

function containsTokenSequence(hay, needle) {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    if (needle.every((p, j) => hay[i + j] === p)) return true;
  }
  return false;
}

/**
 * True if the entry is empty or any split token / joined phrase is a
 * country-level leak (United States, USA, US, North America, …).
 * "US Remote" leaks because `us` ∈ COUNTRY_ALLOW_LEAKS.
 * "United States Remote" leaks because the token sequence `united states` matches.
 */
export function isCountryAllowLeak(token) {
  const parts = splitLocationTokens(token);
  if (parts.length === 0) return true;
  const lower = String(token || '').toLowerCase().trim();
  const joined = parts.join(' ');
  if (COUNTRY_ALLOW_LEAKS.includes(lower) || COUNTRY_ALLOW_LEAKS.includes(joined)) return true;
  if (parts.some((p) => COUNTRY_ALLOW_LEAKS.includes(p))) return true;
  for (const leak of COUNTRY_ALLOW_LEAKS) {
    const leakParts = splitLocationTokens(leak);
    if (leakParts.length >= 2 && containsTokenSequence(parts, leakParts)) return true;
  }
  return false;
}

function tokenListHasRemote(token) {
  return splitLocationTokens(token).includes('remote');
}

/**
 * Stranger-path location_filter invariant:
 *   - Remote never remains in always_allow (moved to allow, then always_allow deleted)
 *   - allow entries that leak any COUNTRY_ALLOW_LEAKS token are dropped
 *     (compound strings like "US Remote" die; a bare Remote may be restored)
 */
export function sanitizeLocationFilter(locationFilter, fields = {}) {
  const src = locationFilter && typeof locationFilter === 'object' ? locationFilter : {};
  const allowIn = keywordList(src.allow);
  const alwaysIn = keywordList(src.always_allow);
  const allow = [];
  let sawRemote = false;

  const consume = (entry, { fromAlwaysAllow = false } = {}) => {
    if (tokenListHasRemote(entry)) sawRemote = true;
    // always_allow is never copied through. Remote is restored on allow below.
    if (fromAlwaysAllow) return;
    if (isCountryAllowLeak(entry)) return;
    allow.push(entry);
  };

  for (const entry of allowIn) consume(entry);
  for (const entry of alwaysIn) consume(entry, { fromAlwaysAllow: true });

  if (sawRemote) allow.push('Remote');

  const remotePref = fields.remote || 'unspecified';
  let nextAllow = uniquePreserve(allow);
  if (nextAllow.length === 0 && remotePref !== 'onsite') {
    nextAllow = ['Remote'];
  }

  const out = { ...src, allow: nextAllow };
  delete out.always_allow;
  return out;
}

function parseRemote(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return 'unspecified';
  if (/\b(on-?site|in-?office|office(?:[ -]based)?)\b/.test(raw) && !/\bremote\b/.test(raw) && !/\bhybrid\b/.test(raw)) {
    return 'onsite';
  }
  if (/\bhybrid\b/.test(raw) || /\bremote[ -]?ok\b/.test(raw) || /\bremote[ -]?friendly\b/.test(raw)) {
    return 'hybrid';
  }
  if (/\b(fully[ -])?remote\b/.test(raw) || /\bwfh\b/.test(raw) || /\bwork from home\b/.test(raw)) {
    return 'remote';
  }
  if (/\bon-?site\b/.test(raw)) return 'onsite';
  return 'unspecified';
}

function parseSeniority(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (!raw) return null;
  if (/\b(intern|internship|junior|entry[ -]?level|associate|apprentice)\b/.test(raw)) return 'junior';
  if (/\b(c[to]o|chief|vp|vice president|head|director)\b/.test(raw)) return 'director';
  if (/\b(principal|staff|distinguished|fellow)\b/.test(raw)) return 'staff';
  if (/\b(senior|sr\.?|lead)\b/.test(raw)) return 'senior';
  if (/\b(mid[ -]?level|mid)\b/.test(raw)) return 'mid';
  return raw.length <= 24 ? raw : null;
}

function cleanFunctionKeyword(raw) {
  let text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  text = text.replace(SENIORITY_STRIP, '').trim();
  text = text.replace(/^(?:of|the)\s+/i, '').trim();
  if (!text || GENERIC_TITLE_GATES.has(text.toLowerCase())) return null;
  if (text.length < 3) return null;
  return text;
}

function parseFunctions(value) {
  return uniquePreserve(asList(value).map(cleanFunctionKeyword).filter(Boolean));
}

function parseCompanies(value) {
  return uniquePreserve(asList(value)).slice(0, 8);
}

/**
 * Pull a city-like token out of a location string.
 * Country-level US tokens are never returned (they leak onsite).
 */
export function extractCityAllowToken(location) {
  const raw = String(location || '').replace(/\s+/g, ' ').trim();
  if (!raw || isCountryAllowLeak(raw)) return null;

  const stripped = raw
    .replace(/\b(remote|hybrid|on-?site|based in|located in)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped || isCountryAllowLeak(stripped)) return null;

  const parts = stripped.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 1) {
    const city = parts[0];
    if (city && !isCountryAllowLeak(city) && city.length >= 3 && !US_STATE_CODES.has(city.toUpperCase())) {
      const cityLower = city.toLowerCase();
      if (!US_STATE_NAMES[cityLower]) return city;
    }
  }
  return null;
}

function buildLocationFilterFromFields(fields) {
  const allow = [];
  const remote = fields.remote || 'unspecified';
  if (remote === 'remote' || remote === 'hybrid' || remote === 'unspecified') {
    allow.push('Remote');
  }
  const city = extractCityAllowToken(fields.location);
  // Remote-only: city stays off the allow list so onsite roles in that city
  // are not admitted. Hybrid / onsite / unspecified with a city: include it.
  if (city && remote !== 'remote') allow.push(city);

  const block = [];
  const locLower = String(fields.location || '').toLowerCase();
  for (const hub of MODEST_OFFSHORE_BLOCK) {
    if (locLower.includes(hub.toLowerCase())) continue;
    block.push(hub);
  }

  return sanitizeLocationFilter({
    allow: uniquePreserve(allow),
    ...(block.length ? { block } : {}),
  }, fields);
}

function buildTitleFilterFromFields(fields) {
  return {
    positive: uniquePreserve(fields.functions || []),
    negative: [...DEFAULT_TITLE_NEGATIVES],
  };
}

function buildDraftPortals(fields) {
  const portals = {
    title_filter: buildTitleFilterFromFields(fields),
    location_filter: buildLocationFilterFromFields(fields),
    job_boards: DEFAULT_JOB_BOARDS.map((b) => ({ ...b })),
  };
  const companies = parseCompanies(fields.companies);
  if (companies.length) {
    portals.tracked_companies = companies.map((name) => ({
      name,
      enabled: false,
      notes: 'Seeded company — add a careers page to include it in search.',
    }));
  }
  return portals;
}

function remoteLabel(remote) {
  if (remote === 'remote') return 'remote roles';
  if (remote === 'hybrid') return 'hybrid or remote roles';
  if (remote === 'onsite') return 'on-site roles';
  return 'roles (work arrangement not specified)';
}

function buildSummary(fields, uncertainties) {
  const functions = (fields.functions || []).join(', ') || 'your function keywords';
  const where = extractCityAllowToken(fields.location) || (fields.location && !isCountryAllowLeak(fields.location) ? fields.location : null);
  const place = where ? ` near ${where}` : '';
  const companyBit = (fields.companies || []).length
    ? ` Companies you named are saved as seeds until they have a careers page.`
    : '';
  const warnBit = uncertainties.length
    ? ` Please check the highlighted guesses before confirming.`
    : '';
  const seniorityBit = fields.seniority
    ? ` Seniority (${fields.seniority}) is kept for later ranking, not used to drop titles at search time.`
    : '';
  return assertCandidateFacing(
    `We'll look for ${functions} ${remoteLabel(fields.remote)}${place}. `
    + `Remote is matched as a location keyword; country names like United States are left out so on-site listings do not sneak in.`
    + seniorityBit
    + companyBit
    + warnBit,
    'plainLanguageSummary',
  );
}

function uncertainty(field, message, confidence = 'medium') {
  return {
    field,
    message: assertCandidateFacing(message, `uncertainty:${field}`),
    confidence,
  };
}

function normalizeFields(input = {}) {
  return {
    location: input.location == null ? '' : String(input.location).trim(),
    remote: parseRemote(input.remote),
    seniority: parseSeniority(input.seniority),
    functions: parseFunctions(input.functions),
    companies: parseCompanies(input.companies),
  };
}

function collectUncertainties(fields, { source }) {
  const uncertainties = [];
  if (!fields.location) {
    uncertainties.push(uncertainty('location', 'No location was given, so search will not pin a city.', 'high'));
  } else if (isCountryAllowLeak(fields.location) && !extractCityAllowToken(fields.location)) {
    uncertainties.push(uncertainty(
      'location',
      'Country-only location was kept off the allow list (it would admit on-site roles). Add a city if you want that metro included.',
      'high',
    ));
  }
  if (fields.remote === 'unspecified') {
    uncertainties.push(uncertainty('remote', 'Work arrangement was not clear; Remote was added to the allow list as a starting point.', source === 'resume' ? 'medium' : 'high'));
  }
  if (!fields.functions.length) {
    uncertainties.push(uncertainty(
      'functions',
      'No function keywords were extracted. Search will not require a title match until you add some (for example “product marketing”).',
      'high',
    ));
  }
  if (!fields.seniority) {
    uncertainties.push(uncertainty('seniority', 'Seniority was not detected. That is fine — it is not used to filter the search.', 'low'));
  }
  if (source === 'resume' && fields.companies.length) {
    uncertainties.push(uncertainty('companies', 'Company names were guessed from the resume and may be incomplete.', 'medium'));
  }
  if (source === 'resume' && fields.remote !== 'unspecified') {
    uncertainties.push(uncertainty('remote', 'Work arrangement was inferred from resume wording and may be wrong.', 'medium'));
  }
  return uncertainties;
}

function makeProposal(fields, { source }) {
  const uncertainties = collectUncertainties(fields, { source });
  const draftPortals = buildDraftPortals(fields);
  return {
    source,
    plainLanguageSummary: buildSummary(fields, uncertainties),
    fields,
    draftPortals,
    uncertainties,
  };
}

/**
 * Build a proposal from the five onboarding answers (no resume).
 *
 * @param {{ location?: string, remote?: string, seniority?: string, functions?: string|string[], companies?: string|string[] }} answers
 * @returns {object} proposal
 */
export function proposeFromAnswers(answers = {}) {
  const fields = normalizeFields(answers);
  return makeProposal(fields, { source: 'answers' });
}

function headerBlock(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.slice(0, 24).join('\n');
}

function extractLocationFromResume(text) {
  const header = headerBlock(text);
  const based = header.match(/\b(?:based in|located in)\s+([^|\n]+)/i);
  if (based) return based[1].replace(/\s+/g, ' ').trim();

  const cityState = header.match(
    /\b([A-Z][A-Za-z .'-]+),\s*([A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)(?:\s*[,|/]\s*(?:USA|United States|US))?\b/,
  );
  if (cityState) return `${cityState[1].trim()}, ${cityState[2].trim()}`;

  if (/\bUnited States\b|\bUSA\b/.test(header)) return 'United States';
  return '';
}

function extractRemoteFromResume(text) {
  const lines = String(text || '').split(/\r?\n/).slice(0, 40);
  for (const line of lines) {
    const parsed = parseRemote(line);
    if (parsed !== 'unspecified') return parsed;
  }
  return 'unspecified';
}

function extractSeniorityFromResume(text) {
  const header = headerBlock(text);
  const titleLine = header.split('\n').map((l) => l.trim()).find((l) => (
    /\b(engineer|manager|director|designer|marketer|analyst|scientist|product|finance|operations|lead|head|vp|chief)\b/i.test(l)
    && !/@/.test(l)
    && l.length < 80
  ));
  return parseSeniority(titleLine || header);
}

function extractFunctionsFromResume(text) {
  const lower = text.toLowerCase();
  const found = [];
  for (const phrase of FUNCTION_PHRASES) {
    if (lower.includes(phrase)) found.push(phrase);
  }
  for (const token of FUNCTION_TOKENS) {
    if (new RegExp(`\\b${token}\\b`, 'i').test(lower)) found.push(token);
  }
  const cleaned = uniquePreserve(found.map(cleanFunctionKeyword).filter(Boolean));
  return cleaned.slice(0, 8);
}

function extractCompaniesFromResume(text) {
  const names = [];
  const lineRe = /^([A-Z][A-Za-z0-9&.'’ -]{1,40})\s+[—–-]\s+(?:19|20)\d{2}/gm;
  let match;
  while ((match = lineRe.exec(text))) {
    const name = match[1].trim();
    if (/\b(manager|engineer|director|marketer|analyst)\b/i.test(name)) continue;
    names.push(name);
  }
  return uniquePreserve(names).slice(0, 8);
}

/**
 * Build a proposal from pasted resume text. Heuristic only; uncertain
 * fields are listed on `uncertainties`.
 *
 * @param {string} resumeText
 * @returns {object} proposal
 */
export function proposeFromResume(resumeText) {
  const text = String(resumeText || '');
  const fields = normalizeFields({
    location: extractLocationFromResume(text),
    remote: extractRemoteFromResume(text),
    seniority: extractSeniorityFromResume(text),
    functions: extractFunctionsFromResume(text),
    companies: extractCompaniesFromResume(text),
  });
  return makeProposal(fields, { source: 'resume' });
}

function mergeEdits(proposal, userEditsOrConfirm) {
  if (userEditsOrConfirm === true || userEditsOrConfirm == null) {
    return { fields: { ...proposal.fields } };
  }
  if (typeof userEditsOrConfirm !== 'object') {
    throw new Error('confirmPortals: edits must be true or an object');
  }
  const nested = userEditsOrConfirm.fields && typeof userEditsOrConfirm.fields === 'object'
    ? userEditsOrConfirm.fields
    : {};
  const merged = {
    location: nested.location ?? userEditsOrConfirm.location ?? proposal.fields.location,
    remote: nested.remote ?? userEditsOrConfirm.remote ?? proposal.fields.remote,
    seniority: nested.seniority ?? userEditsOrConfirm.seniority ?? proposal.fields.seniority,
    functions: nested.functions ?? userEditsOrConfirm.functions ?? proposal.fields.functions,
    companies: nested.companies ?? userEditsOrConfirm.companies ?? proposal.fields.companies,
  };
  return {
    fields: normalizeFields(merged),
    title_filter: userEditsOrConfirm.title_filter,
    location_filter: userEditsOrConfirm.location_filter,
    job_boards: userEditsOrConfirm.job_boards,
  };
}

function applyFilterOverrides(portals, edits) {
  const out = {
    title_filter: { ...portals.title_filter, ...(edits.title_filter || {}) },
    location_filter: { ...portals.location_filter, ...(edits.location_filter || {}) },
    job_boards: Array.isArray(edits.job_boards) ? edits.job_boards.map((b) => ({ ...b })) : portals.job_boards,
  };
  if (Array.isArray(portals.tracked_companies)) {
    out.tracked_companies = portals.tracked_companies.map((c) => ({ ...c }));
  }
  if (Array.isArray(out.title_filter.positive)) {
    out.title_filter.positive = uniquePreserve(out.title_filter.positive.map(cleanFunctionKeyword).filter(Boolean));
  }
  return out;
}

/**
 * Confirm (and optionally edit) a proposal into a scan-ready portals object.
 * Does not write portals.yml.
 *
 * Invariant: the returned `location_filter` never has `always_allow`
 * (Remote found there is moved onto `allow`). Allow entries that contain
 * any COUNTRY_ALLOW_LEAKS token after splitting (e.g. "US Remote") are dropped.
 *
 * @param {object} proposal from proposeFromAnswers / proposeFromResume
 * @param {true|object} [userEditsOrConfirm=true]
 * @returns {object} portals suitable for scan({ portals, plugins: false })
 */
export function confirmPortals(proposal, userEditsOrConfirm = true) {
  if (!proposal || typeof proposal !== 'object') {
    throw new Error('confirmPortals: proposal is required');
  }
  const baseFields = proposal.fields && typeof proposal.fields === 'object'
    ? proposal.fields
    : {};
  const edits = mergeEdits({ fields: baseFields }, userEditsOrConfirm);
  let portals = buildDraftPortals(edits.fields);
  portals = applyFilterOverrides(portals, edits);
  portals.location_filter = sanitizeLocationFilter(portals.location_filter, edits.fields);
  return portals;
}
