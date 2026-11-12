// node --test server/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { clean, merge } = require('./zoom/merge');

const k1 = 'a'.repeat(22), k2 = 'b'.repeat(22);
test('newest entry wins per key, default too', () => {
  const a = clean({ d: [1.2, 100], s: { [k1]: [1.5, 100], [k2]: [0.9, 300] } });
  const b = clean({ d: [1.4, 200], s: { [k1]: [2, 200], [k2]: [1, 200] } });
  const { doc, changed } = merge(a, b);
  assert.ok(changed);
  assert.deepStrictEqual(doc, { d: [1.4, 200], s: { [k1]: [2, 200], [k2]: [0.9, 300] }, x: 0 });
  assert.strictEqual(merge(doc, b).changed, false);
});
test('junk is dropped', () => {
  const doc = clean({ d: [9, 1], s: { short: [1, 1], [k1]: [1.234, 5], [k2]: ['x', 1] } });
  assert.deepStrictEqual(doc, { d: null, s: { [k1]: [1.23, 5] }, x: 0 });
});
test('future timestamps are clamped', () => {
  const doc = clean({ d: [1, 1e15] }, 1000);
  assert.strictEqual(doc.d[1], 1000 + 86400000);
});
test('deletion drops everything set before it, later changes survive', () => {
  const a = clean({ d: [1.2, 100], s: { [k1]: [1.5, 100], [k2]: [2, 400] } });
  const { doc, changed } = merge(a, clean({ x: 300 }));
  assert.ok(changed);
  assert.deepStrictEqual(doc, { d: null, s: { [k2]: [2, 400] }, x: 300 });
  // an old machine posting its stale copy can't bring them back
  assert.deepStrictEqual(merge(doc, clean({ d: [1.2, 100], s: { [k1]: [1.5, 100] } })).doc, doc);
});
