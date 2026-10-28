// node test/format.test.js — exits non-zero on the first failure
const assert = require('assert');
const { fmt } = require('../dist/dataviz.js');
const { money, pct } = fmt;
const M = '−';

const cases = [
  [money(2759750), '$2.76M'],
  [money(412300), '$412k'],
  [money(950), '$950'],
  [money(0), '$0'],
  [money(-0.4), '$0'],
  [money(-412600), M + '$413k'],
  [money(999.4), '$999'],
  [money(999.6), '$1k'],          // rounds up into the next unit, never "$1000"
  [money(999499), '$999k'],
  [money(999500), '$1.00M'],      // never "$1000k"
  [money(1.25e9), '$1.25B'],
  [money(2e6, { trim: true }), '$2M'],
  [money(2.5e6, { trim: true }), '$2.5M'],
  [money(10e6, { trim: true }), '$10M'],
  [money(92320, { sign: true }), '+$92k'],
  [money(-8250, { sign: true }), M + '$8k'],
  [money(0, { sign: true }), '±$0'],
  [money(2759750, { full: true }), '$2,759,750'],
  [money(-412600, { full: true }), M + '$412,600'],
  [money(NaN), '—'],
  [money(null), '—'],
  [pct(87), '87%'],
  [pct(87.44, { digits: 1 }), '87.4%'],
  [pct(2, { sign: true }), '+2%'],
  [pct(-8, { sign: true }), M + '8%'],
  [pct(0.2, { sign: true }), '±0%'],
  [pct(undefined), '—'],
];
cases.forEach(([got, want], i) => assert.strictEqual(got, want, `case ${i}: got ${got}, want ${want}`));
console.log(`ok ${cases.length} formatter cases`);
