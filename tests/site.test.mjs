import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { lightInit, lightOff } from '../skills/partykeys-protocol/assets/web-midi/partykeys-lights.mjs';
import { KEYBOARD_QUERY } from '../skills/partykeys-protocol/assets/web-midi/partykeys-routing.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const decode = s => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

test('both published entry points are identical and inline JavaScript compiles', () => {
  assert.equal(html, fs.readFileSync(path.join(root, 'developers.html'), 'utf8'));
  assert.doesNotThrow(() => new vm.Script(script));
});

test('local download, module and navigation links resolve; HTML ids and copy targets are unambiguous', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, 'duplicate HTML ID');
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if (href.startsWith('#')) assert.ok(ids.includes(href.slice(1)), href);
    else if (!/^(https?:|data:)/.test(href) && !href.includes('\\')) assert.ok(fs.existsSync(path.join(root, href)), href);
  }
  for (const [, id] of html.matchAll(/data-copy-target="([^"]+)"/g)) assert.ok(ids.includes(id), id);
});

test('new lighting rules are complete in Chinese and English and reset to English for other site languages', () => {
  const keys = [...new Set([...html.matchAll(/data-i18n="(verified_[^"]+)"/g)].map(m => m[1]))];
  const nodes = keys.map(key => ({ getAttribute: () => key, innerHTML: '' }));
  const select = { value: 'en' };
  const context = { document: { documentElement: { setAttribute() {} }, querySelectorAll: () => nodes, getElementById: () => select }, localStorage: { setItem() {} } };
  vm.createContext(context);
  const prefix = script.slice(0, script.indexOf("document.getElementById('lang-select').addEventListener"));
  vm.runInContext(prefix, context);
  const dicts = vm.runInContext('i18n', context);
  for (const key of keys) for (const lang of ['en', 'zh']) assert.equal(typeof dicts[lang][key], 'string', `${lang}:${key}`);
  vm.runInContext("setLang('zh')", context);
  assert.equal(nodes[keys.indexOf('verified_title')].innerHTML, '已验证亮灯规则');
  for (const lang of ['en', 'ja', 'ko', 'es', 'fr', 'de', 'pt']) {
    vm.runInContext(`setLang('${lang}')`, context);
    assert.equal(nodes[keys.indexOf('verified_title')].innerHTML, 'Verified lighting rules');
  }
});

test('published initialization frames exactly match the shipped controller and demo is split into small packets', () => {
  const text = html.match(/id="verified-frames">([\s\S]*?)<\/code>/)[1];
  const frames = text.split('\n').filter(line => line.startsWith('F0')).map(line => line.split(' ').map(v => parseInt(v, 16)));
  assert.deepEqual(frames.slice(0, 3), [lightInit('palette71')[0], lightOff('palette71'), KEYBOARD_QUERY]);
  assert.deepEqual(frames.slice(3).map(f => f[8]), [3, 1]);
  assert.ok(frames.slice(3).every(f => f.length <= 16));
  assert.deepEqual(frames.slice(3).flatMap(f => f.slice(9, -1).filter((_, i) => i % 2 === 0)), [60, 64, 67, 72]);
});

test('both AI copy templates include the verified routing profile and do not treat API send as a physical ACK', () => {
  for (const id of ['llm-prompt', 'claude-md']) {
    const match = html.match(new RegExp(`id="${id}">([\\s\\S]*?)</(?:code|pre)>`));
    assert.ok(match, id);
    const text = decode(match[1]);
    for (const expected of ['fruit-webmidi-palette71-v1', 'SAM5704', 'Maximum THREE pairs', '7F/7F', 'CURRENT active target', 'NOT a physical LED acknowledgment', 'never SFX/BGM', 'SEPARATE POPUPIANO']) assert.ok(text.includes(expected), `${id}: ${expected}`);
    assert.ok(!text.includes('always prefer CMD 15'));
  }
});

test('download archive contains exactly the published skill sources, without local paths or secrets', () => {
  const zip = path.join(root, 'downloads/partykeys-protocol.zip');
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n').filter(e => !e.endsWith('/'));
  assert.equal(entries.length, 11);
  for (const entry of entries) {
    assert.ok(/^partykeys-protocol\/(SKILL\.md|agents\/openai\.yaml|assets\/web-midi\/[\w-]+\.mjs|references\/[\w-]+\.md|scripts\/[\w.-]+\.mjs)$/.test(entry), entry);
    const content = execFileSync('unzip', ['-p', zip, entry], { encoding: 'utf8' });
    assert.equal(content, fs.readFileSync(path.join(root, 'skills', entry), 'utf8'), entry);
    assert.ok(!/\/Users\/|gh[pousr]_[A-Za-z0-9]{20,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY/.test(content), entry);
  }
});
