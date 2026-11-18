// node --test tests/view.test.mjs
// Pure view logic: query-string state, slugs, and the tracker's filter/sort.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  parseView,
  serializeView,
  slugify,
  filterEntries,
  sortEntries,
} from '../tracker/view.js';

const dataPath = new URL('../tracker/data.json', import.meta.url);
const D = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

test('round-trips view state through the query string', () => {
  const states = [
    { q: '', level: 'all', sort: 'level' },
    { q: 'heart', level: 'all', sort: 'level' },
    { q: 'heart', level: '4', sort: 'name' },
    { q: 'a&b=c', level: '2', sort: 'level-asc' },
    { q: 'Eyes / retina', level: '0', sort: 'level' },
    { q: '', level: '0', sort: 'level' },
  ];
  for (const state of states) {
    assert.deepEqual(parseView(serializeView(state)), state);
  }
});

test('omits default search, level, and sort', () => {
  assert.equal(serializeView({ q: '', level: 'all', sort: 'level' }), '');
  assert.equal(serializeView({}), '');
  assert.equal(serializeView({ q: 'heart', level: 'all', sort: 'level' }), '?q=heart');
  assert.equal(serializeView({ q: '', level: '2', sort: 'level' }), '?level=2');
  assert.equal(serializeView({ q: '', level: '0', sort: 'level' }), '?level=0');
  assert.equal(serializeView({ q: '', level: 'all', sort: 'name' }), '?sort=name');
  assert.equal(serializeView({ q: '', level: 'all', sort: 'level-asc' }), '?sort=level-asc');
});

test('example link ?q=heart&level=3&sort=level restores a stable view', () => {
  const view = parseView('?q=heart&level=3&sort=level');
  // 3 is a readiness score inside the "in humans, not approved" group (levels 2–3).
  assert.deepEqual(view, { q: 'heart', level: '2', sort: 'level' });
  assert.deepEqual(parseView(serializeView(view)), view);
  assert.deepEqual(
    parseView('https://m-fin.github.io/bionic-body/tracker/?q=heart&level=3&sort=level#heart'),
    view,
  );
});

test('drops invalid params and keeps an unknown hash out of the query', () => {
  assert.deepEqual(parseView(''), { q: '', level: 'all', sort: 'level' });
  assert.deepEqual(parseView(undefined), { q: '', level: 'all', sort: 'level' });
  assert.deepEqual(parseView('?q=%20%20&level=nope&sort=newest&extra=1'), {
    q: '',
    level: 'all',
    sort: 'level',
  });
  assert.deepEqual(parseView('?level=9&sort='), { q: '', level: 'all', sort: 'level' });
  assert.deepEqual(parseView('?level=3.5&sort=az'), { q: '', level: 'all', sort: 'level' });
  assert.equal(parseView('?q=bad%0Aword%7F').q, 'badword');
  assert.equal(parseView('?q=' + 'x'.repeat(500) + '#heart').q.length, 200);
  assert.deepEqual(parseView('?q=heart#lungs'), { q: 'heart', level: 'all', sort: 'level' });
});

test('accepts readiness scores and sort aliases, ignoring case', () => {
  assert.equal(parseView('?level=5').level, '4');
  assert.equal(parseView('?level=4').level, '4');
  assert.equal(parseView('?level=4-5').level, '4');
  assert.equal(parseView('?level=2').level, '2');
  assert.equal(parseView('?level=3').level, '2');
  assert.equal(parseView('?level=2-3').level, '2');
  assert.equal(parseView('?level=0').level, '0');
  assert.equal(parseView('?level=1').level, '0');
  assert.equal(parseView('?level=0-1').level, '0');
  assert.equal(parseView('?LEVEL=5').level, '4');
  assert.equal(parseView('?LEVEL=ALL').level, 'all');
  assert.equal(parseView('?sort=level-desc').sort, 'level');
  assert.equal(parseView('?sort=LEVEL-ASC').sort, 'level-asc');
  assert.equal(parseView('?SORT=Name').sort, 'name');
});

test('slugify builds stable anchors from system names', () => {
  assert.equal(slugify('Heart'), 'heart');
  assert.equal(slugify('Pancreas / insulin'), 'pancreas-insulin');
  assert.equal(slugify('  Spine / nerve interfaces '), 'spine-nerve-interfaces');
  assert.equal(slugify('Arms / hands'), 'arms-hands');
  assert.equal(slugify('Blood vessels'), 'blood-vessels');
  assert.equal(slugify('Össur Power Knee'), 'ossur-power-knee');
  assert.equal(slugify('???'), '');
});

test('every system in data.json has a unique non-empty slug', () => {
  const slugs = D.entries.map((entry) => slugify(entry.system));
  assert.ok(slugs.length >= 1);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const slug of slugs) {
    assert.match(slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
  assert.equal(slugify('Pancreas / insulin'), 'pancreas-insulin');
  assert.ok(slugs.includes('pancreas-insulin'));
  assert.ok(slugs.includes('spine-nerve-interfaces'));
});

test('filter keeps the readiness groups and searches visible card text only', () => {
  const levels = {
    1: 'Lab / animal',
    2: 'First human',
    3: 'Human clinical trials',
    4: 'Approved, limited use',
    5: 'Routine clinical use',
  };
  const entries = [
    { system: 'Heart', type: 'Mechanical', example: 'Pump', status: 'Approved bridge', bottleneck: 'Power', level: 4, sources: [{ label: 'FDA', url: 'https://example.com/secret-token' }] },
    { system: 'Kidneys', type: 'Xeno', example: 'UKidney', status: 'In a trial', bottleneck: 'Rejection', level: 3, goal: 'Commercial 2030', sources: [{ label: 'eGenesis' }] },
    { system: 'Lungs', type: 'Xeno', example: 'Pig lung', status: 'Decedent study', bottleneck: 'Edema', level: 2, sources: [{ label: 'Nature' }] },
    { system: 'Muscles', type: 'Biohybrid', example: 'Hand', status: 'Lab only', bottleneck: 'Fatigue', level: 1, sources: [{ label: 'UTokyo', url: 'https://example.com/not-searchable' }] },
    { system: 'Ears', type: 'Bionic', example: 'Implant', status: 'Routine', bottleneck: 'Music', level: 5, aboveNeck: true, sources: [{ label: 'NIDCD' }] },
  ];

  const ids = (list) => list.map((entry) => entry.system);

  assert.deepEqual(ids(filterEntries(entries, { q: '', level: 'all' }, levels)), ids(entries));
  assert.deepEqual(ids(filterEntries(entries, { q: '   ', level: 'all' }, levels)), ids(entries));
  assert.deepEqual(ids(filterEntries(entries, { q: '', level: '4' }, levels)), ['Heart', 'Ears']);
  assert.deepEqual(ids(filterEntries(entries, { q: '', level: '2' }, levels)), ['Kidneys', 'Lungs']);
  assert.deepEqual(ids(filterEntries(entries, parseView('?level=3'), levels)), ['Kidneys', 'Lungs']);
  assert.deepEqual(ids(filterEntries(entries, { q: '', level: '0' }, levels)), ['Muscles']);
  assert.deepEqual(ids(filterEntries(entries, { q: '', level: 'nope' }, levels)), ids(entries));

  assert.deepEqual(ids(filterEntries(entries, { q: 'HeArT', level: 'all' }, levels)), ['Heart']);
  assert.deepEqual(ids(filterEntries(entries, { q: 'heart', level: '4' }, levels)), ['Heart']);
  assert.deepEqual(ids(filterEntries(entries, { q: 'heart', level: '2' }, levels)), []);
  assert.deepEqual(ids(filterEntries(entries, { q: 'above the neck', level: 'all' }, levels)), ['Ears']);
  assert.deepEqual(ids(filterEntries(entries, { q: 'routine clinical', level: 'all' }, levels)), ['Ears']);
  assert.deepEqual(ids(filterEntries(entries, { q: '2030', level: 'all' }, levels)), ['Kidneys']);
  assert.deepEqual(ids(filterEntries(entries, { q: 'secret-token', level: 'all' }, levels)), []);
  assert.deepEqual(ids(filterEntries(entries, { q: 'not-searchable', level: 'all' }, levels)), []);
  assert.deepEqual(ids(filterEntries(entries, { q: 'utokyo', level: 'all' }, levels)), ['Muscles']);

  assert.deepEqual(entries.map((entry) => entry.system), ['Heart', 'Kidneys', 'Lungs', 'Muscles', 'Ears']);
});

test('sort orders by readiness or name without mutating the input', () => {
  const entries = [
    { system: 'B', level: 2 },
    { system: 'A', level: 4 },
    { system: 'C', level: 2 },
  ];
  assert.deepEqual(sortEntries(entries, 'level').map((entry) => entry.system), ['A', 'B', 'C']);
  assert.deepEqual(sortEntries(entries, 'level-desc').map((entry) => entry.system), ['A', 'B', 'C']);
  assert.deepEqual(sortEntries(entries, 'level-asc').map((entry) => entry.system), ['B', 'C', 'A']);
  assert.deepEqual(sortEntries(entries, 'name').map((entry) => entry.system), ['A', 'B', 'C']);
  assert.deepEqual(sortEntries(entries, 'nope').map((entry) => entry.system), ['A', 'B', 'C']);
  assert.deepEqual(entries.map((entry) => entry.system), ['B', 'A', 'C']);
});

test('filter and sort agree with the readiness groups in data.json', () => {
  const ready = filterEntries(D.entries, { q: '', level: '4' }, D.levels);
  assert.deepEqual(
    ready.map((entry) => entry.id),
    D.entries.filter((entry) => entry.level >= 4).map((entry) => entry.id),
  );

  const mid = filterEntries(D.entries, parseView('?level=3'), D.levels);
  assert.deepEqual(
    mid.map((entry) => entry.id).sort(),
    D.entries.filter((entry) => entry.level === 2 || entry.level === 3).map((entry) => entry.id).sort(),
  );

  const lab = filterEntries(D.entries, { q: '', level: '0' }, D.levels);
  assert.deepEqual(
    lab.map((entry) => entry.id),
    D.entries.filter((entry) => entry.level <= 1).map((entry) => entry.id),
  );

  const visible = (entry) => [
    entry.system,
    entry.type,
    entry.example,
    entry.status,
    entry.bottleneck,
    entry.goal || '',
    D.levels[entry.level],
    entry.aboveNeck ? 'above the neck' : '',
    ...entry.sources.map((source) => source.label),
  ].join(' ').toLowerCase();

  assert.deepEqual(
    filterEntries(D.entries, { q: 'HeArT', level: 'all' }, D.levels).map((entry) => entry.id),
    D.entries.filter((entry) => visible(entry).includes('heart')).map((entry) => entry.id),
  );
  assert.ok(filterEntries(D.entries, { q: 'heart', level: 'all' }, D.levels).some((entry) => entry.id === 'heart'));

  const byLevel = sortEntries(D.entries, 'level');
  for (let i = 1; i < byLevel.length; i++) assert.ok(byLevel[i - 1].level >= byLevel[i].level);
  const byAsc = sortEntries(D.entries, 'level-asc');
  for (let i = 1; i < byAsc.length; i++) assert.ok(byAsc[i - 1].level <= byAsc[i].level);
  const byName = sortEntries(D.entries, 'name').map((entry) => entry.system);
  assert.deepEqual(byName, [...byName].sort((a, b) => a.localeCompare(b)));
  assert.deepEqual(D.entries.map((entry) => entry.id), JSON.parse(fs.readFileSync(dataPath, 'utf8')).entries.map((entry) => entry.id));
});
