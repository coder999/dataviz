// node test/live.test.js — the pure parts of DV.live: trimming, hold-to-now, tooltip time headings
const assert = require('assert');
const { time } = require('../dist/dataviz.js');
const { trim, held, ago } = time;

const now = 1_000_000_000;
const W = 600e3; // 10 min window

// trim keeps everything inside window + 60 s of slack, drops the rest, keeps order
const pts = [[now - W - 61e3, 1], [now - W - 59e3, 2], [now - 1e3, 3]];
assert.deepStrictEqual(trim(pts, now, W), [[now - W - 59e3, 2], [now - 1e3, 3]]);
assert.deepStrictEqual(trim([], now, W), []);

// held: the last value is carried flat to now, nothing interpolated, nothing invented
assert.deepStrictEqual(held([[now - 30e3, 40], [now - 2e3, 42]], now, 90e3), [[now - 30e3, 40], [now - 2e3, 42], [now, 42]]);
// a host silent longer than holdMax is not drawn as if still reporting: the line just ends
assert.deepStrictEqual(held([[now - 120e3, 42]], now, 90e3), [[now - 120e3, 42]]);
// a point exactly at now gains no duplicate; an empty series stays empty
assert.deepStrictEqual(held([[now, 7]], now, 90e3), [[now, 7]]);
assert.deepStrictEqual(held([], now, 90e3), []);
// held never mutates its input (the caller's buffer is shared with push)
const buf = [[now - 2e3, 5]];
held(buf, now, 90e3);
assert.strictEqual(buf.length, 1);

// tooltip headings: minutes for a minutes-long window, seconds for a short one, "now" at the edge
assert.strictEqual(ago(now, now, W), 'now');
assert.strictEqual(ago(now - 20e3, now, W), 'now');   // rounds to 0 minutes
assert.strictEqual(ago(now - 180e3, now, W), '−3m');
assert.strictEqual(ago(now - 30e3, now, 120e3), '−30s');
assert.strictEqual(ago(now - 90e3, now, 120e3), '−90s');

console.log('live: all assertions passed');
