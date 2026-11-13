// node tests/validate-data.mjs -> checks tracker/data.json (exit 0 = valid)
// Every entry needs a known readiness level, the text fields the cards render, and at least one
// dated https source, so the page never shows "undefined" and every claim stays sourced.
import fs from 'fs';
const D = JSON.parse(fs.readFileSync(new URL('../tracker/data.json', import.meta.url), 'utf8'));
const errs = [], err = (m) => errs.push(m), isDate = (s) => /^\d{4}(-\d{2}(-\d{2})?)?$/.test(s);
if (!isDate(D.updated) || D.updated.length !== 10) err(`updated: want YYYY-MM-DD, got ${JSON.stringify(D.updated)}`);
const levels = Object.keys(D.levels || {}).map(Number);
if (levels.join() !== '0,1,2,3,4,5') err(`levels: want keys 0-5, got ${levels.join()}`);
if (!Array.isArray(D.entries) || !D.entries.length) err('entries: missing or empty');
const ids = new Set(), systems = new Set();
for (const [i, e] of (D.entries || []).entries()) {
  const at = `entries[${i}] (${e.id || '?'})`;
  for (const k of ['id', 'system', 'type', 'example', 'status', 'bottleneck']) if (typeof e[k] !== 'string' || !e[k].trim()) err(`${at}: ${k} missing`);
  if (!/^[a-z0-9-]+$/.test(e.id || '')) err(`${at}: id should be lowercase-kebab`);
  if (ids.has(e.id)) err(`${at}: duplicate id`); ids.add(e.id);
  if (systems.has(e.system)) err(`${at}: duplicate system "${e.system}"`); systems.add(e.system);
  if (!Number.isInteger(e.level) || !(String(e.level) in (D.levels || {}))) err(`${at}: level ${e.level} is not 0-5`);
  if ('goal' in e && (typeof e.goal !== 'string' || !e.goal.trim())) err(`${at}: goal present but empty`);
  if ('aboveNeck' in e && typeof e.aboveNeck !== 'boolean') err(`${at}: aboveNeck must be true/false`);
  if (!Array.isArray(e.sources) || !e.sources.length) { err(`${at}: needs at least one source`); continue; }
  for (const [j, s] of e.sources.entries()) {
    if (!s.label || !String(s.label).trim()) err(`${at} source ${j}: label missing`);
    if (!isDate(String(s.date || ''))) err(`${at} source ${j}: date should be YYYY, YYYY-MM or YYYY-MM-DD, got ${JSON.stringify(s.date)}`);
    if (D.updated && s.date > D.updated) err(`${at} source ${j}: date ${s.date} is after "updated" ${D.updated}`);
    try { if (new URL(s.url).protocol !== 'https:') err(`${at} source ${j}: url should be https`); } catch { err(`${at} source ${j}: bad url ${JSON.stringify(s.url)}`); }
  }
}
const n = (D.entries || []).length, sum = (D.entries || []).reduce((a, e) => a + (e.level || 0), 0);
console.log(errs.length ? errs.map((m) => 'FAIL ' + m).join('\n') : `PASS ${n} systems, ${sum}/${n * 5} points (${Math.round(sum / (n * 5) * 100)}% on the meter)`);
process.exit(errs.length ? 1 : 0);
