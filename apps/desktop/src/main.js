import './styles.css';
import {
  proposeFromAnswers,
  proposeFromResume,
  confirmPortals,
} from '@career-loop/core/onboarding.mjs';

const app = document.querySelector('#app');

const state = {
  mode: 'answers',
  proposal: null,
  portals: null,
  busy: false,
  message: '',
  error: '',
};

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

async function invokeTurnOn(portals) {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    return await invoke('turn_on_career_loop', { portals });
  } catch {
    const { turnOnCareerLoop } = await import('@career-loop/core/loop.mjs');
    return await turnOnCareerLoop({
      portals,
      skipSchedule: true,
      scheduleDryRun: true,
    });
  }
}

function render() {
  app.innerHTML = '';
  const main = el(`<main>
    <h1>Career Loop</h1>
    <p class="lede">Daily job matches on your computer. No developer accounts required.</p>
    <section class="card" id="onboarding"></section>
    <section class="card" id="confirm" hidden></section>
    <section id="status"></section>
  </main>`);
  app.appendChild(main);

  const onboarding = main.querySelector('#onboarding');
  const tabs = el(`<div class="tabs">
    <button type="button" class="ghost ${state.mode === 'answers' ? 'active' : ''}" data-mode="answers">Five questions</button>
    <button type="button" class="ghost ${state.mode === 'resume' ? 'active' : ''}" data-mode="resume">Paste resume</button>
  </div>`);
  tabs.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      render();
    });
  });
  onboarding.appendChild(tabs);

  if (state.mode === 'resume') {
    onboarding.appendChild(el(`<div>
      <label for="resume">Resume text</label>
      <textarea id="resume" placeholder="Paste your resume here"></textarea>
      <button class="primary" id="propose">Review search plan</button>
    </div>`));
    onboarding.querySelector('#propose').onclick = () => {
      const resumeText = onboarding.querySelector('#resume').value;
      state.proposal = proposeFromResume(resumeText);
      state.portals = null;
      state.error = '';
      render();
    };
  } else {
    onboarding.appendChild(el(`<div>
      <div class="row">
        <div><label for="location">Where do you want to work?</label>
        <input id="location" placeholder="Boise, ID" /></div>
        <div><label for="remote">Remote, hybrid, or on-site?</label>
        <select id="remote">
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
          <option value="unspecified">Not sure</option>
        </select></div>
      </div>
      <div class="row">
        <div><label for="seniority">Seniority</label>
        <input id="seniority" placeholder="Senior, mid, ..." /></div>
        <div><label for="functions">What kind of roles?</label>
        <input id="functions" placeholder="product marketing, design, ..." /></div>
      </div>
      <label for="companies">Companies you care about (optional)</label>
      <input id="companies" placeholder="Acme, Globex" />
      <button class="primary" id="propose">Review search plan</button>
    </div>`));
    onboarding.querySelector('#propose').onclick = () => {
      state.proposal = proposeFromAnswers({
        location: onboarding.querySelector('#location').value,
        remote: onboarding.querySelector('#remote').value,
        seniority: onboarding.querySelector('#seniority').value,
        functions: onboarding.querySelector('#functions').value,
        companies: onboarding.querySelector('#companies').value,
      });
      state.portals = null;
      state.error = '';
      render();
    };
  }

  const confirm = main.querySelector('#confirm');
  if (state.proposal) {
    confirm.hidden = false;
    const fields = state.proposal.fields || {};
    confirm.appendChild(el(`<div>
      <h2 style="margin-top:0;font-size:1.1rem">Does this look right?</h2>
      <p class="summary">${escapeHtml(state.proposal.plainLanguageSummary || '')}</p>
      <label for="kw">Keywords</label>
      <input id="kw" value="${escapeHtml((fields.functions || []).join(', '))}" />
      <label for="loc">Location note</label>
      <input id="loc" value="${escapeHtml(fields.location || '')}" />
      <button class="primary" id="turnon"${state.busy ? ' disabled' : ''}>Turn on Career Loop</button>
    </div>`));
    confirm.querySelector('#turnon').onclick = async () => {
      state.busy = true;
      state.error = '';
      state.message = 'Starting your first scan…';
      render();
      try {
        const edits = {
          fields: {
            ...fields,
            functions: confirm.querySelector('#kw').value,
            location: confirm.querySelector('#loc').value,
          },
        };
        const portals = confirmPortals(state.proposal, edits);
        state.portals = portals;
        const result = await invokeTurnOn(portals);
        state.message = formatResult(result);
      } catch (err) {
        state.error = String(err?.message || err);
        state.message = '';
      } finally {
        state.busy = false;
        render();
      }
    };
  }

  const status = main.querySelector('#status');
  if (state.error) {
    status.appendChild(el(`<div class="status error">${escapeHtml(state.error)}</div>`));
  } else if (state.message) {
    status.appendChild(el(`<div class="status">${escapeHtml(state.message)}</div>`));
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatResult(result) {
  const n = result?.scan?.new_count ?? 0;
  const digest = result?.digest?.paths?.html || result?.digest?.paths?.md || '';
  const sched = result?.schedule?.detail || 'schedule stubbed / dry-run in this shell';
  return [
    'Career Loop is on.',
    `First scan found ${n} new role${n === 1 ? '' : 's'}.`,
    digest ? `Digest saved to: ${digest}` : 'Digest written under Application Support.',
    `Schedule: ${sched}`,
    'Empty days still notify you.',
  ].join('\n');
}

render();
