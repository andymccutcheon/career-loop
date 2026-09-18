import './styles.css';
import {
  proposeFromAnswers,
  proposeFromResume,
  confirmPortals,
  turnOnCareerLoop,
} from './desktop-api.js';

const app = document.querySelector('#app');

const state = {
  mode: 'answers',
  answers: {
    location: '',
    remote: 'remote',
    seniority: '',
    functions: '',
    companies: '',
  },
  resumeText: '',
  keywordEdit: '',
  locationEdit: '',
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
      <textarea id="resume" placeholder="Paste your resume here">${escapeHtml(state.resumeText)}</textarea>
      <button class="primary" id="propose"${state.busy ? ' disabled' : ''}>Review search plan</button>
    </div>`));
    onboarding.querySelector('#resume').oninput = (e) => {
      state.resumeText = e.target.value;
    };
    onboarding.querySelector('#propose').onclick = async () => {
      state.resumeText = onboarding.querySelector('#resume').value;
      state.busy = true;
      state.error = '';
      state.message = 'Building your search plan…';
      render();
      try {
        state.proposal = await proposeFromResume(state.resumeText);
        const fields = state.proposal.fields || {};
        state.keywordEdit = (fields.functions || []).join(', ');
        state.locationEdit = fields.location || '';
        state.portals = null;
        state.message = '';
      } catch (err) {
        state.error = String(err?.message || err);
        state.message = '';
      } finally {
        state.busy = false;
        render();
      }
    };
  } else {
    onboarding.appendChild(el(`<div>
      <div class="row">
        <div><label for="location">Where do you want to work?</label>
        <input id="location" placeholder="Boise, ID" value="${escapeHtml(state.answers.location)}" /></div>
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
        <input id="seniority" placeholder="Senior, mid, ..." value="${escapeHtml(state.answers.seniority)}" /></div>
        <div><label for="functions">What kind of roles?</label>
        <input id="functions" placeholder="product marketing, design, ..." value="${escapeHtml(state.answers.functions)}" /></div>
      </div>
      <label for="companies">Companies you care about (optional)</label>
      <input id="companies" placeholder="Acme, Globex" value="${escapeHtml(state.answers.companies)}" />
      <button class="primary" id="propose"${state.busy ? ' disabled' : ''}>Review search plan</button>
    </div>`));
    onboarding.querySelector('#remote').value = state.answers.remote || 'remote';
    ['location', 'remote', 'seniority', 'functions', 'companies'].forEach((id) => {
      onboarding.querySelector(`#${id}`).addEventListener('input', (e) => {
        state.answers[id] = e.target.value;
      });
      onboarding.querySelector(`#${id}`).addEventListener('change', (e) => {
        state.answers[id] = e.target.value;
      });
    });
    onboarding.querySelector('#propose').onclick = async () => {
      state.answers = {
        location: onboarding.querySelector('#location').value,
        remote: onboarding.querySelector('#remote').value,
        seniority: onboarding.querySelector('#seniority').value,
        functions: onboarding.querySelector('#functions').value,
        companies: onboarding.querySelector('#companies').value,
      };
      state.busy = true;
      state.error = '';
      state.message = 'Building your search plan…';
      render();
      try {
        state.proposal = await proposeFromAnswers(state.answers);
        const fields = state.proposal.fields || {};
        state.keywordEdit = (fields.functions || []).join(', ');
        state.locationEdit = fields.location || '';
        state.portals = null;
        state.message = '';
      } catch (err) {
        state.error = String(err?.message || err);
        state.message = '';
      } finally {
        state.busy = false;
        render();
      }
    };
  }

  const confirm = main.querySelector('#confirm');
  if (state.proposal) {
    confirm.hidden = false;
    const fields = state.proposal.fields || {};
    const kw = state.keywordEdit || (fields.functions || []).join(', ');
    const loc = state.locationEdit || fields.location || '';
    confirm.appendChild(el(`<div>
      <h2 style="margin-top:0;font-size:1.1rem">Does this look right?</h2>
      <p class="summary">${escapeHtml(state.proposal.plainLanguageSummary || '')}</p>
      <label for="kw">Keywords</label>
      <input id="kw" value="${escapeHtml(kw)}" />
      <label for="loc">Location note</label>
      <input id="loc" value="${escapeHtml(loc)}" />
      <button class="primary" id="turnon"${state.busy ? ' disabled' : ''}>Turn on Career Loop</button>
    </div>`));
    confirm.querySelector('#kw').oninput = (e) => {
      state.keywordEdit = e.target.value;
    };
    confirm.querySelector('#loc').oninput = (e) => {
      state.locationEdit = e.target.value;
    };
    confirm.querySelector('#turnon').onclick = async () => {
      const edits = {
        fields: {
          ...fields,
          functions: confirm.querySelector('#kw').value,
          location: confirm.querySelector('#loc').value,
        },
      };
      state.keywordEdit = edits.fields.functions;
      state.locationEdit = edits.fields.location;
      state.busy = true;
      state.error = '';
      state.message = 'Starting your first scan…';
      render();
      try {
        const portals = await confirmPortals(state.proposal, edits);
        state.portals = portals;
        const result = await turnOnCareerLoop(portals);
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
