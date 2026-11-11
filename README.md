# coder999/dataviz

The shared "Full Score" visual system: CSS tokens for light and dark, self-hosted
fonts, and Apache ECharts chart builders, so every site that uses it looks like
part of one family. It is static assets only, with no PHP and no build step.

This package contains no data. `demo/data.js` is a fictional household made for
the demo.

## What ships in `dist/`

| File | What it is |
| --- | --- |
| `dataviz.css` | `--dv-*` tokens (light + dark, including `--dv-status-ok` / `--dv-status-error`), `@font-face` rules (relative `fonts/` urls), and the primitives: `.dv-rm`, `.dv-num`, `.dv-sh`, `.dv-plate`, `.dv-slot-1..6`, `.dv-sr-only` |
| `dataviz.js` | `window.DV`: theme reader, chart builders, rehearsal marks, formatters. Plain ES2020 script |
| `echarts.min.js` | Apache ECharts 5.6.0, byte-identical to the npm `echarts@5.6.0` dist (sha256 `bf4a2235…07b1`, checked 2026-10-28) |
| `fonts/` | Bodoni Moda 500/700, Source Serif 4 400/600, Public Sans 400/500/600 (latin woff2, from Fontsource) + their OFL-1.1 texts |
| `LICENSE-echarts.txt`, `NOTICE-echarts.txt`, `LICENSE-d3-echarts.txt` | ECharts' Apache-2.0 license, notice, and the BSD license for its embedded d3 code |

## Installing it in a site

nginx denies `vendor/` on these sites, so the assets have to be copied under
`htdocs/`. In the consuming site's `composer.json`:

```json
"repositories": [{ "type": "vcs", "url": "https://github.com/coder999/dataviz" }],
"require": { "coder999/dataviz": "^0.1" },
"scripts": {
    "post-install-cmd": ["@dataviz-assets"],
    "post-update-cmd": ["@dataviz-assets"],
    "dataviz-assets": "rm -rf htdocs/assets/dataviz && mkdir -p htdocs/assets && cp -R vendor/coder999/dataviz/dist htdocs/assets/dataviz"
}
```

The line to paste is the `dataviz-assets` command. `composer install --no-scripts`
skips it. Decide per site whether to commit `htdocs/assets/dataviz/` or gitignore it
and rely on the deploy running `composer install`.

## Using it

```html
<link rel="stylesheet" href="/assets/dataviz/dataviz.css">
<script src="/assets/dataviz/echarts.min.js"></script>
<script src="/assets/dataviz/dataviz.js"></script>
```

Give each chart container a height in your own CSS, then:

```js
DV.history(el, [{ date: '2019-03-01', value: 690000, label: '2019 Q1' }, …]);
DV.survivalStrip(el, { years, pct, marks, ages });
DV.fan(el, { years, p5, p25, p50, p75, p95, marks, ages, tint, line: { name, values } });
DV.stacked(el, { years, series: [{ name, values, slot }], marks, ages });
DV.score(el, { years, ages: [[…], […]], staves: [{ name, values, slot }], marks });
DV.sankey(el, { nodes: [{ name, slot | tint }], links: [{ source, target, value }] });
DV.lines(el, { years, series: [{ name, values }], marks, ages });
DV.bars(el, { labels, series: [{ name, values, slot | tint | color }], horizontal, stacked, valueLabels }, { format, category });
DV.treemap(el, { name, value, children: [{ name, value, children }] }, { format: DV.fmt.bytes, depth: 2 });
DV.daily(el, { dates: ['2026-10-03', …], series: [{ name, values }], band: { lo, hi } });
const c = DV.live(el, { series: [{ name: 'CPU', points: [[Date.now(), 12], …] }], max: 100, format: v => DV.fmt.pct(v) });
c.push(0, [Date.now(), 14]);
```

- `el` is an element or a selector. Every builder returns the ECharts instance.
  Calling a builder again on the same element updates that chart.
- `years` are whole years. Each year is drawn as a band `[y, y+1)`.
- `ages` is optional on every year chart: one array per person, aligned to
  `years`, printed under each year label in entity colours 1, 2, ….
- `marks` is `[{ mark: 'A', year: 2030, label: '…' }]`, drawn as boxed rehearsal
  letters.
- `slot` (1–6) selects `--dv-entity-N`. `fan` and `survivalStrip` take
  `{ slot }` as a third argument and default to 3.
- `DV.fan` draws nested 5th–95th and 25th–75th percentile bands with the median over them.
  A fan that is not a person (a household's investable money) passes `tint: 1–5` in the data
  instead (use an odd step, so the median line reads on the ground). `line: { name, values }`
  overlays one more stepped line, such as the single deterministic projection, in
  `--dv-line-2`, dashed, on a surface-coloured casing above the median, with a dashed legend key, its own tooltip row and table
  column. The value axis starts at 0; `yTicks` works as on `DV.stacked`. `yMax` caps the axis (for
  example 1.2 × the largest 75th percentile, so a long 95th-percentile tail does not flatten the rest):
  bands and lines are clipped at it and the plot's top-right corner reads "5th–95th continues to $39M
  by 2076". The tooltip and the hidden data table keep the full values.
- `DV.fan`, `DV.stacked` and `DV.lines` keep rehearsal letters in one row at every width: marks whose
  boxes would collide merge into one box (`D·E`, or `D–F` for a run of consecutive letters).
- Every builder accepts `{ label }` in its third argument to override the
  generated `aria-label` and table caption.
- `name` on a score staff may be `"Owner · Source"`. On narrow charts it wraps
  after the owner.
- A score staff may carry `pending: { from, to, label }` for years where the
  source exists but its amount is not known yet (`to` defaults to the last year,
  `label` to "amount pending"). Those years draw as a hairline in the staff
  colour with the label at the start, and read as the label in the tooltip and
  the data table.
- `ageSlots` (optional, every year chart): the entity slot for each `ages`
  row, so each person's ages wear that person's colour. Defaults to 1, 2, ….
- Entity slots are for people. A series that is not a person (a tax bucket, an
  asset class) passes `tint: 1–5` instead of `slot`. The `--dv-tint-N` set alternates
  dark and light (odd steps dark on the light theme, light on the dark one), so in a
  stack of tints 1, 2, 3, 4, 5 any two neighbours differ by at least 3:1; steps two
  apart differ by hue. For lines on the ground use the odd steps (1, 3, 5).
- `yTicks` (DV.stacked, DV.lines, DV.daily): about that many value-axis ticks, e.g. 3 for $0 / $5M / $10M.
- A score staff may carry `labelValues` aligned to `values`: the amount labels and where a
  new run starts follow them (for example a full-year rate) while the band thickness keeps
  `values` (the year's actual amount, thinner in a part year).
- `DV.lines` draws several stepped lines on the shared year axis, not stacked, for series
  that are not people (scenarios). Series k wears `--dv-line-k` and a dash pattern (solid,
  dashed, dotted, dash-dot), all 2px, and is labelled at its end with its name and last value.
  Colour alone cannot separate three or more lines: no set of three can differ >= 3:1 from
  each other while each keeps 3:1 against the ground, so the dash pattern and the end label
  carry identity. The first series carries the rehearsal marks.
- `DV.score` on a narrow chart (< 560px) puts each staff's name above it across
  the full plot width and keeps rehearsal letters in one row. Marks whose boxes
  would collide merge into one box (`D·E`) on the first mark's line; every line
  still draws, tapping the box selects its first mark, and it fills when any of
  its marks is active, so give each event its own `data-dv-mark` control too.
  The mark lines stop short of the staff names and break around the amounts.
  A pending label steps past any mark line it would cross.

### Live charts

`DV.live(el, d, o)` draws streaming `[tMs, value]` points on a time window that slides
continuously, with a gradient-filled area under each line (the network-dashboard look).

- `d.series`: `[{ name, points, line? }]`. Series k wears `--dv-line-k`, or `line: 1–4` to choose one.
- `d.window`: seconds shown, default 600. `d.max` fixes the value axis (100 for a percentage);
  leave it out and the axis follows the data (throughput). `d.format(v)` formats the axis, the
  tooltip and the hidden table, defaulting to `DV.fmt.count`.
- The returned instance has `.push(seriesIndex, [tMs, value])`. Feed new points as they arrive;
  points older than the window plus 60 s are dropped.
- **Nothing is invented.** Between points the line holds the last value flat to now. A series
  silent for longer than `d.holdMax` seconds (default 90) stops holding, so a source that went
  quiet shows a gap instead of looking live.
- The axis shows clock times, which slide with the data. The tooltip heading says how long ago
  (`−3m`, or `−30s` for a window of two minutes or less).
- `o.gutter` (px, default 64) is the width of the value labels on the right. It is fixed rather than
  fitted to the labels, so live charts stacked in a column end at the same x.
- `o.compact: true` is a sparkline with no axes. A compact chart takes the height its container
  gives it (`.dv-compact` lifts the usual 120px minimum).
- Motion: one shared animation loop drives every live chart, at `o.fps` (30 by default, 8 when
  compact). It runs only while a chart is on screen and the tab is visible. With reduced motion
  there is no loop: the chart redraws when a point is pushed. Live charts use ECharts' canvas
  renderer rather than SVG, because redrawing SVG paths many times a second is what costs a phone.
- The hidden data table gives each series' latest value and its low and high over the window.

### Cash-flow sankey

`DV.sankey` draws flows between named nodes (names must be unique). A node with
no incoming link is a source: it sits in the left column with its label on the
left. A node with no outgoing link is a use: right column, label on the right.
Anything in between (a hub such as "This year's money") carries its label above
it. Nodes keep the order given, so pass them in reading order. People take their
ribbon `slot`; everything else passes `tint: 1–5`. Each flow takes the colour of
the source it comes from, or of the use it goes to when it leaves a hub. Labels
are the name over the amount; on narrow charts names wrap inside a 30% margin.
When small neighbouring nodes would stack their labels, the lower label moves down
just far enough to clear the one above.
Hovering a node highlights its flows. The hidden table lists every flow as
From / To / Amount. There is no year axis and no rehearsal marks: draw one
sankey per year and let a control pick the year.

### Treemap

`DV.treemap` draws a nested `{ name, value, children }` tree as boxes sized by
value: a WinDirStat-style storage map, or any breakdown with more than one level.
A parent's `value` must be at least the sum of its children's; any excess is its
own share. Each top-level branch takes the next entity colour (cycling after six)
and its descendants keep that hue. `depth` levels show at once (default 2).
Clicking a box zooms into it and the breadcrumb under the chart climbs back.
Labels are the name over the value and are truncated, or dropped, when a box is
too small. The tooltip gives the full path, the value and its share of the
parent. Values format with `format` (default `DV.fmt.count`; pass
`DV.fmt.bytes` for storage). The hidden table lists the top level: Part, Size,
Share. A redraw (resize or theme change) returns to the top.

### Status colours

`--dv-status-ok` (done, saved) and `--dv-status-error` (an error, a destructive
action) exist so sites stop borrowing a person's ribbon for state. They are not
entity colours and never colour a series. Both clear 4.5:1 as text on ground and
plate in both themes (checked 2026-10-28; values in `dataviz.css`). Pair them
with a word or an icon; colour is never the only signal.

### Rehearsal marks across the page

`DV.marks.set('B')`, `DV.marks.toggle('B')` and `DV.marks.active` control the
selected mark. Clicking a mark letter inside any chart toggles it. Any element
with `data-dv-mark="B"` (for example `<button class="dv-rm" data-dv-mark="B">B</button>`)
toggles it too, and its `aria-pressed` is kept in sync. Every change re-renders
all charts and fires `document`'s `dv:mark` event with
`detail = { mark, year, label }`.

### Theme

The theme follows `prefers-color-scheme`. Set `data-theme="light"` or
`data-theme="dark"` on `<html>` to override it. Charts read the tokens at render
time (`DV.theme(el)`) and re-render on a scheme change, on a `data-theme` change,
when the web fonts finish loading, and when the chart is resized. Inactive mark
boxes take their background from the chart's nearest painted ancestor.

Text contrast (WCAG AA) and chart-mark contrast (3:1) for every token, against
both `--dv-ground` and `--dv-plate`, were checked on 2026-10-28. Re-check if you
change a value.

### Daily counts

`DV.daily` is the one builder on a day axis rather than a year axis, for counts such as
site visitors. `dates` are ISO days (`'2026-10-03'`), shown as `Oct 3` in UTC so no viewer's
timezone moves a day. One series without a band draws as a filled area. Several series draw
as lines in `--dv-line-k` with the `DV.lines` dash patterns and a legend. `band: { lo, hi,
name? }` shades a normal range behind the data (named "Normal range" by default; its tooltip
key uses `.dv-band`). With a band, every series draws as a line so the band stays readable.
Values format with `DV.fmt.count`. There are no rehearsal marks and no ages.
`labels` (optional, aligned to `dates`) replaces the generated `Oct 3` text on the axis, in the
tooltip and in the data table, for series that are not daily (monthly counts: `Oct ’26`).

### Formatters

`DV.fmt.money(v, { trim, full, sign })` returns `$2.76M`, `$412k`, `$950`,
`$2.5M` (with `trim`), `$2,759,750` (with `full`), or `+$92k` / `−$8k` (with
`sign`). `DV.fmt.pct(v, { digits, sign })` returns `87%`.
`DV.fmt.count(v, { compact, sign })` returns `12,308`, or `950` / `1.2k` / `12k` / `2.5M`
with `compact` (never `1000` or `1000k`). `DV.fmt.day('2026-10-03')` returns `Oct 3`.
`DV.fmt.bytes(v)` returns `950 B`, `1.0 KB`, `433.8 GB`: binary steps (1024) with the
usual labels, as Google Drive reports storage, and never `1024.0 KB`.

### Accessibility

Each chart container gets `role="img"` and a generated `aria-label` that
summarises the data. A visually hidden `<table>` holding the full data is
inserted right after the container. `DV.table(el, { caption, columns, rows })`
does the same for anything else. When `prefers-reduced-motion` is set, nothing
animates.

### Strict CSP

The builders work under `default-src 'self'; script-src 'self'; style-src 'self'`.
They render with ECharts' SVG renderer, and every tooltip is built with classes
from `dataviz.css`, never `style=""`. If you write your own ECharts options, keep
to that rule: ECharts' default tooltip formatter emits inline styles, and this
CSP blocks them.

## Changes

- **0.8.1** (2026-11-11): `DV.treemap` header bands stay tinted at every depth (past the
  third level they were white, hiding the folder name).
- **0.8.0** (2026-11-11): `DV.treemap`, nested boxes with click-to-zoom and a breadcrumb;
  formatter `DV.fmt.bytes`.
- **0.7.3** (2026-11-10): `DV.bars` takes `labelClicks`: category labels emit `click` like their bars.
- **0.7.2** (2026-11-10): `DV.bars` takes `secondary`, booleans aligned to `labels`: those bars draw
  lighter with muted labels, for rows breaking down the bar above them (an expanded group).
- **0.7.1** (2026-11-10): `DV.bars` measures its wrapped legend with the real font, so it no longer
  overlaps the plot in narrow cards, and thins value-axis ticks on narrow horizontal charts.
  `DV.daily` keeps its first and last axis labels inside the plot (the last one was clipped).
- **0.7.0** (2026-11-10): `DV.bars`, bars on a category axis: vertical or horizontal (ranked,
  long names truncated), optionally stacked, with optional value labels past each bar's end.
  Series may take `color` as a custom property name (`'--series-3'`), read at draw time. Fixes the
  version string, which 0.6.2 left at 0.6.1.
- **0.6.2** (2026-11-07): `DV.daily` takes `labels`, so monthly counts can use it without reading as days.
- **0.5.4** (2026-11-07): a score label goes inside its band only when the band's own run is wide enough for it; a one-year spike followed by zeros is labeled above it, not cut off.
- **0.5.3** (2026-11-07): the fan's "continues to" label rounds to two significant figures ($39M, not $39.19M): a 95th percentile of 1,000 futures is not that precise.
- **0.5.2** (2026-11-07): `DV.fan`'s overlaid line sits on a surface-coloured casing so its dashes stay
  legible over the median and the bands.
- **0.5.1** (2026-11-07): `DV.fan` takes `yMax` (clipped bands, a "continues to" label) and draws
  a dashed legend key for its overlaid line; `DV.fan`, `DV.stacked` and `DV.lines` merge colliding
  rehearsal marks into one box at every width (`D–F` for a consecutive run).
- **0.5.0** (2026-11-06): `DV.fan` takes `tint` (non-person fans), `line` (an overlaid dashed
  line such as the deterministic path, in the legend, tooltip and data table) and `yTicks`; its value
  axis starts at 0 and its top margin follows the wrapped legend like `DV.stacked`.
- **0.4.0** (2026-11-06): `DV.score` staves take `tint` as well as `slot` (non-person staves such as
  taxes); `DV.stacked` sizes its top margin to the wrapped legend so the marks lane never overlaps it;
  the selected rehearsal-mark year is an ink hairline frame instead of an accent wash, so it cannot
  read as a series.
- **0.3.0** (2026-10-30): `DV.daily`, a day-axis chart for counts with an optional
  normal-range band; formatters `DV.fmt.count` and `DV.fmt.day`; `.dv-band` tooltip key.
- **0.2.3** (2026-10-28): `DV.lines` takes its colours from new `--dv-line-1..4` tokens (hues kept
  clear of the person ribbons, each >= 4.6:1 on ground and plate in both themes) plus a dash pattern
  per series, one stroke weight, and names each line at its end (colliding names shift apart).
- **0.2.2** (2026-10-28): the tint set is categorical: alternating dark and light navy,
  slate and indigo-grey, so neighbouring bands of a stack differ by at least 3:1 (light and dark);
  `DV.stacked` drops the stroke between bands and takes `yTicks`; `DV.score` staves take
  `labelValues` (labels and runs follow them, bands keep `values`); new `DV.lines`.
- **0.2.1** (2026-10-28): `DV.sankey` nudges a label down when the one above it in the
  same column would overlap (small adjacent flows), and keeps room for it at the bottom.
- **0.2.0** (2026-10-28): `DV.sankey`; status tokens `--dv-status-ok` and
  `--dv-status-error` (light and dark); `DV.theme()` also returns `statusOk` and
  `statusError`.
- **0.1.3**: phone score merges colliding marks and keeps lines off names and amounts.
- **0.1.2**: phone score layout, `ageSlots`, tint ramp for non-person series.
- **0.1.1**: pending staves on `DV.score`.
- **0.1.0**: Full Score tokens, fonts and ECharts builders.

## Development

```sh
node test/format.test.js                                   # formatter assertions
NODE_PATH=/path/to/node_modules node test/csp-check.js     # needs playwright
```

`csp-check.js` serves the repo with the strict CSP header, loads `demo/` at 1440
light, 1440 dark and 390 light, clicks marks and hovers a tooltip, then writes
`demo/shots/*.png`. It exits non-zero on any CSP violation or console error.
To view the demo by hand, serve the repo root and open `/demo/`.
