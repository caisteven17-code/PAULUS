import assert from 'node:assert/strict';
import { calculateProgressiveTax, type ProgressiveTaxScheme } from './progressiveTax';

const scheme: ProgressiveTaxScheme = {
  id: 'scheme-1',
  version: 1,
  name: 'Initial Progressive Taxation Scheme',
  effectiveFrom: '2026-01-01',
  status: 'published',
  brackets: [
    { id: 'b1', ordinal: 1, minimumAmount: 1, maximumAmount: 25_000, rate: 0.125 },
    { id: 'b2', ordinal: 2, minimumAmount: 25_000.01, maximumAmount: 50_000, rate: 0.15 },
    { id: 'b3', ordinal: 3, minimumAmount: 50_000.01, maximumAmount: 80_000, rate: 0.175 },
    { id: 'b4', ordinal: 4, minimumAmount: 80_000.01, maximumAmount: 100_000, rate: 0.2 },
    { id: 'b5', ordinal: 5, minimumAmount: 100_000.01, maximumAmount: 120_000, rate: 0.215 },
    { id: 'b6', ordinal: 6, minimumAmount: 120_000.01, maximumAmount: 125_000, rate: 0.225 },
    { id: 'b7', ordinal: 7, minimumAmount: 125_000.01, maximumAmount: 150_000, rate: 0.24 },
    { id: 'b8', ordinal: 8, minimumAmount: 150_000.01, maximumAmount: 1_000_000, rate: 0.25 },
  ],
};

function calculate(total: number, selectedScheme: ProgressiveTaxScheme | null = scheme) {
  return calculateProgressiveTax({
    reportingYear: 2026,
    reportingMonth: 4,
    weekdayCollections: total,
    sundayCollections: 0,
    saturdayCollections: 0,
    scheme: selectedScheme,
  });
}

assert.deepEqual(
  [
    [1, 0.125],
    [25_000, 0.125],
    [25_000.01, 0.15],
    [50_000, 0.15],
    [50_000.01, 0.175],
    [80_000.01, 0.2],
    [100_000.01, 0.215],
    [120_000.01, 0.225],
    [125_000.01, 0.24],
    [150_000.01, 0.25],
    [1_000_000, 0.25],
  ].map(([amount, rate]) => [amount, calculate(amount).taxRate]),
  [
    [1, 0.125],
    [25_000, 0.125],
    [25_000.01, 0.15],
    [50_000, 0.15],
    [50_000.01, 0.175],
    [80_000.01, 0.2],
    [100_000.01, 0.215],
    [120_000.01, 0.225],
    [125_000.01, 0.24],
    [150_000.01, 0.25],
    [1_000_000, 0.25],
  ],
);

assert.equal(calculate(25_000.01).taxAmount, 3_750);
assert.equal(calculate(0).status, 'zero');
assert.equal(calculate(1_000_000.01).status, 'out_of_range');
assert.equal(calculate(10_000, null).status, 'missing_scheme');

const split = calculateProgressiveTax({
  reportingYear: 2026,
  reportingMonth: 4,
  weekdayCollections: 10_000.1,
  sundayCollections: 10_000.2,
  saturdayCollections: 5_000,
  scheme,
});
assert.equal(split.massCollectionTotal, 25_000.3);
assert.equal(split.taxRate, 0.15);
assert.equal(split.taxAmount, 3_750.05);
