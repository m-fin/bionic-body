import { parseView, serializeView, slugify, filterEntries, sortEntries } from './view.js';

const $ = (id) => document.getElementById(id);
let D;
let highlightTimer = 0;
let highlighted = null;

fetch('data.json')
  .then((response) => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  })
  .then((data) => {
    D = data;
    init();
  })
  .catch((error) => {
    $('pct').textContent = '–';
    $('cards').innerHTML = '<p class="err">Couldn\'t load the tracker data (' + String(error.message || error).replace(/[<&>]/g, '') + '). If you opened this file directly, serve the folder instead (for example <code>python3 -m http.server</code>) or use the live site.</p>';
  });

function init() {
  $('updated').textContent = D.updated;
  $('legend').textContent = 'Readiness: ' + Object.entries(D.levels).map(([key, label]) => key + ' = ' + label).join(' · ');
  const n = D.entries.length;
  const sum = D.entries.reduce((total, entry) => total + entry.level, 0);
  const pct = Math.round(sum / (n * 5) * 100);
  $('pct').textContent = pct + '%';
  setTimeout(() => { $('fill').style.width = pct + '%'; }, 50);
  $('method').textContent = `Method: every tracked system counts equally. Each system's readiness (0–5) is divided by 5, and the ${n} systems are averaged: ${sum} of ${n * 5} possible points. This measures how close each replacement is to routine clinical use. It is not a measure of body mass or of how much of any one person has been replaced.`;
  const view = parseView(location.search);
  $('q').maxLength = 200;
  $('q').value = view.q;
  $('filter').value = view.level;
  $('sort').value = view.sort;
  for (const id of ['sort', 'filter', 'q']) $(id).addEventListener('input', render);
  $('cards').addEventListener('click', onCopyClick);
  window.addEventListener('hashchange', revealHash);
  revealHash();
}

function readView() {
  return { q: $('q').value, level: $('filter').value, sort: $('sort').value };
}

function render() {
  const view = readView();
  const list = sortEntries(filterEntries(D.entries, view, D.levels), view.sort);
  $('cards').innerHTML = list.map(cardHtml).join('') || '<p>No matches.</p>';
  syncUrl();
}

function cardHtml(entry) {
  const slug = slugify(entry.system);
  const low = entry.level < 4 ? ' low' : '';
  const neck = entry.aboveNeck ? ' · above the neck' : '';
  const goal = entry.goal ? `<p class="goal">${esc(entry.goal)}</p>` : '';
  const dots = [1, 2, 3, 4, 5].map((i) => `<i class="${i <= entry.level ? 'on' : ''}"></i>`).join('');
  const sources = entry.sources.map((source) => `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)} (${esc(source.date)}) ↗</a>`).join('');
  return `<article class="card" id="${slug}" tabindex="-1"><h3><span class="sys">${esc(entry.system)}</span><span class="lvl${low}">${entry.level}/5 · ${esc(D.levels[entry.level])}</span></h3><button type="button" class="copylink" data-slug="${slug}" data-name="${esc(entry.system)}" aria-label="Copy link to ${esc(entry.system)}">Copy link</button><div class="dots" aria-hidden="true">${dots}</div><span class="tag">${esc(entry.type)}${neck}</span><div class="ex">${esc(entry.example)}</div><p>${esc(entry.status)}</p><p><b>Bottleneck:</b> ${esc(entry.bottleneck)}</p>${goal}<div class="src">${sources}</div></article>`;
}

function syncUrl() {
  const url = new URL(location.href);
  url.search = serializeView(readView());
  const next = url.pathname + url.search + url.hash;
  const current = location.pathname + location.search + location.hash;
  if (next !== current) history.replaceState(null, '', url);
}

function hashSlug() {
  const raw = location.hash.slice(1);
  if (!raw) return '';
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return '';
  }
}

function canonicalSlug() {
  const want = hashSlug();
  if (!want) return '';
  const entry = D.entries.find((item) => slugify(item.system) === want);
  return entry ? slugify(entry.system) : '';
}

function revealHash() {
  const slug = canonicalSlug();
  if (slug) {
    const visible = filterEntries(D.entries, readView(), D.levels).some((entry) => slugify(entry.system) === slug);
    if (!visible) {
      $('q').value = '';
      $('filter').value = 'all';
    }
  }
  render();
  if (!slug) return;
  if (location.hash !== '#' + slug) {
    const url = new URL(location.href);
    url.hash = slug;
    history.replaceState(null, '', url);
  }
  const card = document.getElementById(slug);
  if (card) highlight(card, true);
}

function highlight(card, focus) {
  if (highlighted && highlighted !== card) highlighted.classList.remove('highlight');
  highlighted = card;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  card.classList.remove('highlight');
  void card.offsetWidth;
  card.classList.add('highlight');
  clearTimeout(highlightTimer);
  highlightTimer = setTimeout(() => {
    card.classList.remove('highlight');
    if (highlighted === card) highlighted = null;
  }, 2000);
  if (focus) card.focus({ preventScroll: true });
}

function onCopyClick(event) {
  const button = event.target.closest('.copylink');
  if (!button) return;
  const slug = button.getAttribute('data-slug');
  const name = button.getAttribute('data-name') || 'this system';
  const url = new URL(location.href);
  url.hash = slug;
  history.replaceState(null, '', url);
  const card = document.getElementById(slug);
  if (card) highlight(card, false);
  const text = url.toString();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => markCopied(button, name, true), () => markCopied(button, name, false));
  } else {
    markCopied(button, name, false);
  }
}

function markCopied(button, name, ok) {
  const status = $('status');
  if (status) {
    status.textContent = ok
      ? `Link to ${name} copied to clipboard.`
      : `Could not copy the link to ${name}. It is in the address bar.`;
  }
  button.textContent = ok ? 'Copied' : 'Copy link';
  button.setAttribute('aria-label', ok ? `Copied link to ${name}` : `Copy link to ${name}`);
  if (ok) {
    setTimeout(() => {
      if (!button.isConnected) return;
      button.textContent = 'Copy link';
      button.setAttribute('aria-label', `Copy link to ${name}`);
    }, 1600);
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
