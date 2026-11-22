import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMarks, normalizeRich, toggleMark, isMarked, editMarks, sliceMarks, runs, formattedHtml } from '../src/formatting.js';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const text = 'alpha beta gamma';
const bold = toggleMark(text, [], 0, 10, 'bold');
test('bold and highlight toggle independently across overlaps', () => {
  let marks = toggleMark(text, bold, 6, 16, 'highlight');
  assert.equal(isMarked(text, marks, 0, 10, 'bold'), true);
  assert.equal(isMarked(text, marks, 6, 16, 'highlight'), true);
  marks = toggleMark(text, marks, 0, 10, 'bold');
  assert.equal(marks.some(m => m.bold), false);
  assert.equal(isMarked(text, marks, 6, 16, 'highlight'), true);
});
test('partly formatted selection applies uniformly then removes', () => {
  const marks = toggleMark(text, bold, 5, 16, 'bold');
  assert.equal(isMarked(text, marks, 0, 16, 'bold'), true);
  assert.deepEqual(toggleMark(text, marks, 0, 16, 'bold'), []);
});
test('replacement across boundaries preserves text and surviving marks', () => {
  const next = 'alNEWmma';
  const marks = editMarks(text, next, bold, { start: 2, end: 13 });
  assert.equal(runs(next, marks).map(r => r.text).join(''), next);
  assert.equal(isMarked(next, marks, 0, 2, 'bold'), true);
  assert.equal(isMarked(next, marks, 2, 5, 'bold'), false);
});
test('insertions within a passage inherit both styles; deletion clips ranges', () => {
  const marks = [{ start: 0, end: 5, bold: true, highlight: true }];
  const inserted = editMarks('alpha', 'alXXpha', marks, {start:2,end:2});
  assert.equal(isMarked('alXXpha', inserted, 0, 7, 'bold'), true);
  assert.equal(isMarked('alXXpha', inserted, 0, 7, 'highlight'), true);
  assert.deepEqual(editMarks('alpha', '', marks, {start:0,end:5}), []);
});
test('native selection disambiguates repeated characters', () => {
  const marks = editMarks('aaaa', 'aaaaa', [{ start: 0, end: 2, bold: true }], {start:1,end:1});
  assert.equal(marks[0].end, 3);
});
test('UTF-16 offsets preserve emoji, accents, newlines and whitespace', () => {
  const value = '  🐔 café\n終わり  ';
  const m = toggleMark(value, [], 2, 4, 'bold');
  assert.equal(runs(value, m)[1].text, '🐔');
  assert.equal(runs(value, m).map(r=>r.text).join(''), value);
  assert.equal(normalizeRich(value, m).content, value);
});
test('collapsible split and restoration preserve every character and mark', () => {
  const all = toggleMark(text, bold, 6, 16, 'highlight');
  const pieces = [[0,3],[3,12],[12,text.length]].map(([start,end])=>({content:text.slice(start,end),marks:sliceMarks(text,all,start,end)}));
  assert.equal(pieces.map(p=>p.content).join(''), text);
  let offset=0; const restored=[];
  for(const p of pieces){restored.push(...p.marks.map(m=>({...m,start:m.start+offset,end:m.end+offset})));offset+=p.content.length;}
  assert.deepEqual(normalizeMarks(text,restored),all);
});
test('save/history/export JSON round trips preserve formatting, old text works', () => {
  const doc={blocks:[{id:'a',type:'text',content:text,marks:bold}],versions:[]};
  for(let i=0;i<7;i++) doc.versions=[{blocks:structuredClone(doc.blocks)},...doc.versions].slice(0,5);
  const saved=JSON.parse(JSON.stringify(doc));
  assert.equal(saved.versions.length,5);
  assert.deepEqual(saved.blocks,saved.versions[4].blocks);
  assert.deepEqual(normalizeRich('old plain text').marks,[]);
});
test('malformed imported ranges are bounded and unknown style flags ignored', () => {
  assert.deepEqual(normalizeMarks('abc',[{start:-10,end:99,bold:true},{start:1,end:2,highlight:'yes'},{start:NaN,end:4,bold:true}]),[{start:0,end:3,bold:true,highlight:false}]);
});
test('HTML export escapes hostile text and allows only strong/mark markup', () => {
  const value='<img src=x onerror=alert(1)> & "hello"';
  const html=formattedHtml(value,[{start:0,end:value.length,bold:true,highlight:true}]);
  assert.ok(html.startsWith('<mark><strong>&lt;img'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&amp;'));
});
test('CRLF normalization maps formatting offsets without trimming text', () => {
  const rich=normalizeRich('a\r\nb',[{start:3,end:4,bold:true}]);
  assert.equal(rich.content,'a\nb');assert.equal(rich.marks[0].start,2);
});
test('the deployed cursor/scroll resize correction remains byte-for-byte unchanged', () => {
  const source=fs.readFileSync('src/main.jsx','utf8');
  const baseline=execFileSync('git',['show','dd0cf1c:src/main.jsx'],{encoding:'utf8'});
  const resize=s=>s.match(/  function resize\(el, allowShrink = false\) \{[\s\S]*?\n  \}/)[0];
  assert.equal(resize(source),resize(baseline));
  assert.ok(source.includes("onBlur={event => resize(event.currentTarget, true)}"));
  assert.ok(source.includes("onInput={event => resize(event.currentTarget)}"));
});

test('replacement inherits a uniform style across different highlight boundaries', () => {
  const marks=toggleMark(text,bold,3,8,'highlight');
  const next=editMarks(text,'X gamma',marks,{start:0,end:10});
  assert.equal(isMarked('X gamma',next,0,1,'bold'),true);
  assert.equal(isMarked('X gamma',next,0,1,'highlight'),false);
});
