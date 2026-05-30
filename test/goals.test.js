import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGoals } from '../src/goals.js';

test('mixed done/undone tasks', () => {
  const md = [
    '- [ ] write spec',
    '- [x] implement parser',
    '- [ ] add tests',
  ].join('\n');

  const r = parseGoals(md);
  assert.equal(r.total, 3);
  assert.equal(r.done, 1);
  assert.deepEqual(r.items, [
    { text: 'write spec', done: false },
    { text: 'implement parser', done: true },
    { text: 'add tests', done: false },
  ]);
});

test('empty / falsy input returns empty result', () => {
  for (const input of ['', null, undefined, 0, false]) {
    assert.deepEqual(parseGoals(input), { total: 0, done: 0, items: [] });
  }
});

test('non-task lines are ignored', () => {
  const md = [
    '# Heading',
    'Some prose paragraph.',
    '- a plain bullet (not a task)',
    '- [ ] real task',
    '',
    '1. ordered item',
    '- [x] another task',
  ].join('\n');

  const r = parseGoals(md);
  assert.equal(r.total, 2);
  assert.equal(r.done, 1);
  assert.deepEqual(r.items, [
    { text: 'real task', done: false },
    { text: 'another task', done: true },
  ]);
});

test('uppercase X is treated as done', () => {
  const r = parseGoals('- [X] done with capital X');
  assert.equal(r.total, 1);
  assert.equal(r.done, 1);
  assert.deepEqual(r.items, [{ text: 'done with capital X', done: true }]);
});

test('checkbox marker is stripped from text', () => {
  const r = parseGoals('- [ ] just the text remains');
  assert.equal(r.items[0].text, 'just the text remains');
});

test('leading whitespace and alternate list markers (* +) are accepted', () => {
  const md = [
    '  - [ ] indented dash',
    '* [x] star marker',
    '+ [X] plus marker',
  ].join('\n');

  const r = parseGoals(md);
  assert.equal(r.total, 3);
  assert.equal(r.done, 2);
  assert.deepEqual(r.items.map((i) => i.text), [
    'indented dash',
    'star marker',
    'plus marker',
  ]);
});

test('CRLF line endings are handled', () => {
  const r = parseGoals('- [ ] one\r\n- [x] two');
  assert.equal(r.total, 2);
  assert.equal(r.done, 1);
});
