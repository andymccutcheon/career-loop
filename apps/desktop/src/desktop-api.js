/**
 * Desktop UI talks only to Tauri invoke commands.
 * Web-only preview (plain Vite) uses local stubs — never @career-loop/core.
 */

const DEFAULT_BOARDS = [
  { name: 'Himalayas', provider: 'himalayas', enabled: true },
  { name: 'Remotive', provider: 'remotive', enabled: true },
  { name: 'Jobicy', provider: 'jobicy', enabled: true },
];

const DEFAULT_NEGATIVES = [
  'Intern',
  'Internship',
  'Coordinator',
  'Assistant',
  'Junior',
  'Entry Level',
  'Apprentice',
  'Freelance',
];

export function isTauriRuntime() {
  return Boolean(
    typeof window !== 'undefined'
    && (window.__TAURI_INTERNALS__ || window.__TAURI__),
  );
}

function asList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => asList(item));
  return String(value)
    .split(/[,;\n|/]+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function stubProposal(source, input = {}) {
  const location = String(input.location || '').trim();
  const remote = String(input.remote || 'unspecified').trim() || 'unspecified';
  const seniority = String(input.seniority || '').trim() || null;
  const functions = asList(input.functions);
  const companies = asList(input.companies);
  const keywords = functions.join(', ') || 'your function keywords';
  const place = location && !/^(us|usa|united states|north america)$/i.test(location)
    ? ` near ${location}`
    : '';
  return {
    source,
    stub: true,
    plainLanguageSummary:
      `We'll look for ${keywords} (${remote})${place}. `
      + 'This browser preview does not run a live scan. '
      + 'Open the desktop app to save your search and turn on Career Loop.',
    fields: { location, remote, seniority, functions, companies },
    draftPortals: stubPortals({ location, remote, functions, companies }),
    uncertainties: [
      {
        field: 'preview',
        message: 'Browser preview uses sample search settings. Open the desktop app for a real plan.',
        confidence: 'high',
      },
    ],
  };
}

function stubPortals(fields = {}) {
  const functions = asList(fields.functions);
  const companies = asList(fields.companies);
  const remote = String(fields.remote || 'unspecified');
  const location = String(fields.location || '').trim();
  const allow = [];
  if (remote !== 'onsite') allow.push('Remote');
  const city = location.split(',')[0]?.trim();
  if (city && remote !== 'remote' && city.length >= 3 && !/^(us|usa|united states|north america)$/i.test(city)) {
    allow.push(city);
  }
  const portals = {
    title_filter: { positive: functions, negative: [...DEFAULT_NEGATIVES] },
    location_filter: { allow: allow.length ? allow : (remote === 'onsite' ? [] : ['Remote']) },
    job_boards: DEFAULT_BOARDS.map((b) => ({ ...b })),
  };
  if (companies.length) {
    portals.tracked_companies = companies.map((name) => ({
      name,
      enabled: false,
      notes: 'Seeded company — add a careers page to include it in search.',
    }));
  }
  return portals;
}

function stubTurnOn(portals) {
  return {
    ok: true,
    primary_action: 'Turn on Career Loop',
    stub: true,
    scan: { new_count: 0, errors: [], providers_stub: true },
    digest: {
      claimed_email_sent: false,
      empty: true,
      notify: 'browser-preview',
      paths: {},
    },
    schedule: {
      detail: 'Browser preview: schedule is not registered. Open the desktop app to turn on Career Loop.',
      user_copies_plist: false,
      catch_up_on_wake: true,
    },
    portals,
  };
}

async function invokeCommand(cmd, args) {
  if (!isTauriRuntime()) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
}

export async function proposeFromAnswers(answers) {
  const live = await invokeCommand('propose_from_answers', { answers });
  return live ?? stubProposal('answers', answers);
}

export async function proposeFromResume(resumeText) {
  const live = await invokeCommand('propose_from_resume', { resume_text: resumeText });
  return live ?? stubProposal('resume', { functions: '', location: '', remote: 'unspecified' });
}

export async function confirmPortals(proposal, edits) {
  const live = await invokeCommand('confirm_portals', { proposal, edits });
  if (live) return live;
  const fields = {
    ...(proposal?.fields || {}),
    ...(edits?.fields || {}),
  };
  return stubPortals(fields);
}

export async function turnOnCareerLoop(portals) {
  const live = await invokeCommand('turn_on_career_loop', { portals });
  return live ?? stubTurnOn(portals);
}
