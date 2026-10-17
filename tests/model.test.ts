import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveApplication, parseApplications, safeUrl } from '../src/lib/model.ts';
import { buildSankey } from '../src/lib/sankey.ts';
const record = {
  id: 'one',
  company: 'Test',
  role: 'Developer',
  location: 'İstanbul',
  workType: 'Uzaktan',
  stage: 'saved',
  date: '2026-10-15',
  interviewAt: '',
  url: '',
  notes: '',
  color: '#287565',
};
test('backup import validates data, duplicate IDs, and stage', () => {
  assert.equal(parseApplications(JSON.stringify([record])).length, 1);
  assert.throws(() => parseApplications(JSON.stringify([record, record])));
  assert.throws(() => parseApplications(JSON.stringify([{ ...record, stage: 'unknown' }])));
  assert.throws(() => parseApplications(JSON.stringify([{ ...record, interviewAt: 'invalid' }])));
  assert.throws(() => parseApplications('{}'));
});
test('stage transition preserves data without mutating the original', () => {
  const original = parseApplications(JSON.stringify([record]));
  const next = moveApplication(original, 'one', 'interview');
  assert.equal(next[0].stage, 'interview');
  assert.equal(original[0].stage, 'saved');
  assert.equal(next[0].notes, original[0].notes);
  assert.deepEqual(moveApplication(original, 'missing', 'offer'), original);
});
test('job links accept only http and https URLs', () => {
  assert.equal(safeUrl('javascript:alert(1)'), undefined);
  assert.equal(safeUrl('data:text/html,test'), undefined);
  assert.equal(safeUrl('https://example.com/jobs'), 'https://example.com/jobs');
});
test('Sankey counts each application once and conserves flow width', () => {
  const items = parseApplications(
    JSON.stringify(
      ['saved', 'applied', 'interview', 'offer', 'rejected', 'applied'].map((stage, i) => ({
        ...record,
        id: String(i),
        stage,
      })),
    ),
  );
  const graph = buildSankey(items);
  assert.equal(graph.total, 6);
  assert.equal(
    graph.flows.reduce((sum, f) => sum + f.count, 0),
    6,
  );
  assert.ok(
    Math.abs(graph.flows.reduce((sum, f) => sum + f.thickness, 0) - graph.flowHeight) < 1e-9,
  );
  assert.equal(graph.flows.find((f) => f.stage === 'applied')?.count, 2);
  // Updating a stage must move one unit rather than inventing intermediate history.
  const moved = buildSankey(moveApplication(items, '0', 'offer'));
  assert.equal(moved.total, 6);
  assert.equal(
    moved.flows.some((f) => f.stage === 'saved'),
    false,
  );
  assert.equal(moved.flows.find((f) => f.stage === 'offer')?.count, 2);
});
test('Sankey has no phantom flows for empty data or unoccupied stages', () => {
  const empty = buildSankey([]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.flows, []);
  const single = buildSankey(parseApplications(JSON.stringify([record])));
  assert.equal(single.flows.length, 1);
  assert.equal(single.flows[0].percent, 100);
  assert.equal(single.flows[0].thickness, single.flowHeight);
});
