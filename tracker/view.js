// Pure tracker view logic: query string, slugs, filter, and sort.
// No DOM, so Node tests and the page share one implementation.

const MAX_QUERY = 200;

// Readiness filter groups match the Show menu: 4–5, 2–3, and 0–1.
const LEVEL_BUCKET = {
  all: 'all',
  '0': '0',
  '1': '0',
  '0-1': '0',
  '2': '2',
  '3': '2',
  '2-3': '2',
  '4': '4',
  '5': '4',
  '4-5': '4',
};

const SORTS = {
  level: 'level',
  'level-desc': 'level',
  'level-asc': 'level-asc',
  name: 'name',
};

export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeQuery(value) {
  if (value == null) return '';
  return String(value).replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, MAX_QUERY);
}

function normalizeLevel(value) {
  if (value == null) return 'all';
  return LEVEL_BUCKET[String(value).trim().toLowerCase()] || 'all';
}

function normalizeSort(value) {
  if (value == null) return 'level';
  return SORTS[String(value).trim().toLowerCase()] || 'level';
}

function param(params, name) {
  for (const [key, value] of params) {
    if (key.toLowerCase() === name) return value;
  }
  return null;
}

function searchParamsFrom(input) {
  if (input == null) return new URLSearchParams();
  if (typeof input !== 'string') {
    if (typeof input.search === 'string') return new URLSearchParams(input.search);
    return new URLSearchParams();
  }
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).searchParams;
    } catch {
      return new URLSearchParams();
    }
  }
  const bare = trimmed.startsWith('?') ? trimmed.slice(1) : trimmed;
  const hashAt = bare.indexOf('#');
  return new URLSearchParams(hashAt === -1 ? bare : bare.slice(0, hashAt));
}

export function parseView(input) {
  const params = searchParamsFrom(input);
  return {
    q: normalizeQuery(param(params, 'q')),
    level: normalizeLevel(param(params, 'level')),
    sort: normalizeSort(param(params, 'sort')),
  };
}

export function serializeView(view = {}) {
  const params = new URLSearchParams();
  const q = normalizeQuery(view.q);
  const level = normalizeLevel(view.level);
  const sort = normalizeSort(view.sort);
  if (q) params.set('q', q);
  if (level !== 'all') params.set('level', level);
  if (sort !== 'level') params.set('sort', sort);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

// Same fields a reader can see on the card. URLs and JSON keys stay out, so
// "url" or "level" do not match every entry.
export function searchText(entry, levels = {}) {
  const sources = Array.isArray(entry.sources) ? entry.sources.map((source) => source.label) : [];
  return [
    entry.system,
    entry.type,
    entry.example,
    entry.status,
    entry.bottleneck,
    entry.goal || '',
    levels?.[entry.level],
    entry.aboveNeck ? 'above the neck' : '',
    ...sources,
  ].join(' ').toLowerCase();
}

function matchesLevel(entryLevel, filter) {
  if (filter === '4') return entryLevel >= 4;
  if (filter === '2') return entryLevel >= 2 && entryLevel <= 3;
  if (filter === '0') return entryLevel <= 1;
  return true;
}

export function filterEntries(entries, view = {}, levels) {
  const level = normalizeLevel(view.level);
  const q = normalizeQuery(view.q).toLowerCase();
  return entries.filter((entry) => {
    if (!matchesLevel(entry.level, level)) return false;
    if (!q) return true;
    return searchText(entry, levels).includes(q);
  });
}

export function sortEntries(entries, sort) {
  const mode = normalizeSort(sort);
  return entries.slice().sort((a, b) => {
    if (mode === 'name') return a.system.localeCompare(b.system);
    if (mode === 'level-asc') return a.level - b.level;
    return b.level - a.level;
  });
}
