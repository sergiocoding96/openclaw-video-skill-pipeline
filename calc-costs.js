const fs = require('fs');
const path = require('path');

// Gemini pricing (per million tokens)
const pricing = {
  'gemini-2.5-pro':              { input: 1.25, output: 10.00 },
  'gemini-2.5-flash':            { input: 0.15, output: 0.60 },
  'gemini-2.0-flash':            { input: 0.10, output: 0.40 },
  'gemini-3-pro-preview':        { input: 1.25, output: 10.00 },
  'gemini-3-flash-preview':      { input: 0.15, output: 0.60 },
  'gemini-3.1-pro-preview':      { input: 1.25, output: 10.00 },
  'gemini-3.1-flash-lite-preview': { input: 0.075, output: 0.30 },
};

const dir = path.join(__dirname, 'results');

// Load result files
const v1 = JSON.parse(fs.readFileSync(path.join(dir, 'training mama 1_2026-03-08T21-32-16.json')));
const v2 = JSON.parse(fs.readFileSync(path.join(dir, 'Training mama 2_2026-03-08T21-13-25.json')));
const v2first = JSON.parse(fs.readFileSync(path.join(dir, 'Training mama 2_2026-03-08T21-09-47.json')));
const v2_3x = JSON.parse(fs.readFileSync(path.join(dir, 'Training mama 2_2026-03-08T21-17-07.json')));

// Merge all video 2 results
const v2All = [
  ...v2.results,
  ...v2first.results.filter(r => r.model === 'gemini-2.0-flash'),
  ...v2_3x.results,
];

console.log('');
console.log('='.repeat(115));
console.log('  COST ANALYSIS PER MODEL (per video)');
console.log('='.repeat(115));
console.log([
  'Model'.padEnd(32),
  'Vid'.padStart(4),
  'Steps'.padStart(6),
  'In Tok'.padStart(8),
  'Out Tok'.padStart(8),
  'Time'.padStart(7),
  'Cost'.padStart(10),
].join(' | '));
console.log('-'.repeat(115));

const modelTotals = {};

for (const [label, results, vidNum] of [['V1', v1.results, 1], ['V2', v2All, 2]]) {
  for (const r of results) {
    if (!r.success || !r.tokens) continue;
    const p = pricing[r.model];
    if (!p) continue;

    const inputCost = (r.tokens.input / 1_000_000) * p.input;
    const outputCost = (r.tokens.output / 1_000_000) * p.output;
    const totalCost = inputCost + outputCost;

    if (!modelTotals[r.model]) modelTotals[r.model] = { totalCost: 0, totalSteps: 0, totalTime: 0, totalIn: 0, totalOut: 0, runs: 0 };
    modelTotals[r.model].totalCost += totalCost;
    modelTotals[r.model].totalSteps += r.step_count;
    modelTotals[r.model].totalTime += r.elapsed_seconds;
    modelTotals[r.model].totalIn += r.tokens.input;
    modelTotals[r.model].totalOut += r.tokens.output;
    modelTotals[r.model].runs++;

    console.log([
      r.model.padEnd(32),
      ('V' + vidNum).padStart(4),
      String(r.step_count).padStart(6),
      String(r.tokens.input).padStart(8),
      String(r.tokens.output).padStart(8),
      (r.elapsed_seconds + 's').padStart(7),
      ('$' + totalCost.toFixed(4)).padStart(10),
    ].join(' | '));
  }
}

console.log('-'.repeat(115));
console.log('');
console.log('='.repeat(115));
console.log('  TOTALS (both videos combined)');
console.log('='.repeat(115));
console.log([
  'Model'.padEnd(32),
  'Runs'.padStart(5),
  'Steps'.padStart(6),
  'In Tok'.padStart(8),
  'Out Tok'.padStart(8),
  'Time'.padStart(7),
  'Total $'.padStart(10),
  '$/step'.padStart(8),
  '$/video'.padStart(9),
].join(' | '));
console.log('-'.repeat(115));

const sorted = Object.entries(modelTotals).sort((a, b) => b[1].totalSteps - a[1].totalSteps);
for (const [model, t] of sorted) {
  const costPerStep = t.totalSteps > 0 ? t.totalCost / t.totalSteps : 0;
  const costPerVideo = t.runs > 0 ? t.totalCost / t.runs : 0;
  console.log([
    model.padEnd(32),
    String(t.runs).padStart(5),
    String(t.totalSteps).padStart(6),
    String(t.totalIn).padStart(8),
    String(t.totalOut).padStart(8),
    (t.totalTime.toFixed(0) + 's').padStart(7),
    ('$' + t.totalCost.toFixed(4)).padStart(10),
    ('$' + costPerStep.toFixed(4)).padStart(8),
    ('$' + costPerVideo.toFixed(4)).padStart(9),
  ].join(' | '));
}
console.log('='.repeat(115));
