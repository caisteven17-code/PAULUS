import assert from 'node:assert/strict';
import { mapOcrToIafrManualFields, type OcrMappingResult } from './ocrIafrMapper';
import type { PositionedWord } from '../../lib/browserOcr';

function map(text: string, confidence = 92, words: PositionedWord[] = []): OcrMappingResult {
  return mapOcrToIafrManualFields(text, words, confidence);
}

{
  const result = map(`
    Weekday Collections 1,250.50
    Sunday Collections 25,000.00
    Electric Bill 3900
  `);

  assert.equal(result.values.weekday_collections, '1250.50');
  assert.equal(result.values.sunday_collections, '25000.00');
  assert.equal(result.values.electricity, '39.00');
  assert.equal(result.reviews.weekday_collections.status, 'mapped');
}

{
  const result = map('Sunday Collections', 90);

  assert.equal(result.values.sunday_collections, undefined);
  assert.equal(result.reviews.sunday_collections.status, 'low_confidence');
  assert.equal(result.reviews.parking_fees.status, 'unmatched');
}

{
  const result = map('Sunday Collections 100.00\nSunday Collections 200.00', 92);

  assert.equal(result.values.sunday_collections, '100.00');
  assert.equal(result.reviews.sunday_collections.sourceLine.trim(), 'Sunday Collections 100.00');
}

{
  const words: PositionedWord[] = [{ text: 'Electric', confidence: 90, page: 2, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }];
  const result = map('Electric Bill 7,500.00', 40, words);

  assert.equal(result.values.electricity, '7500.00');
  assert.equal(result.reviews.electricity.status, 'low_confidence');
  assert.equal(result.reviews.electricity.sourcePage, 2);
}

{
  const result = map('Baptism Infant 200 2 5 1000 25 125 1125', 95);

  assert.equal(result.values['A.1.02.chargeable'], '5');
  assert.equal(result.values['A.1.02.overAboveRate'], '25');
}

{
  const rowWords: PositionedWord[] = [
    {
      text: 'Weekday',
      confidence: 94,
      page: 1,
      bbox: { x0: 400, y0: 100, x1: 500, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: 'Collections',
      confidence: 94,
      page: 1,
      bbox: { x0: 505, y0: 100, x1: 620, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: '76,918.00',
      confidence: 92,
      page: 1,
      bbox: { x0: 630, y0: 100, x1: 700, y1: 125 },
      yellowCoverage: 0.72,
      pageWidth: 1000,
    },
    {
      text: '117,113.00',
      confidence: 95,
      page: 1,
      bbox: { x0: 720, y0: 100, x1: 800, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
  ];
  const result = map('Weekday Collections 76,918.00 117,113.00', 93, rowWords);

  assert.equal(result.values.weekday_collections, '76918.00');
  assert.equal(result.reviews.weekday_collections.rawValue, '76,918.00');
}

{
  const rowWords: PositionedWord[] = [
    {
      text: 'Mortuary',
      confidence: 92,
      page: 1,
      bbox: { x0: 400, y0: 100, x1: 500, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: 'Columbary',
      confidence: 92,
      page: 1,
      bbox: { x0: 505, y0: 100, x1: 610, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: '5.0%',
      confidence: 95,
      page: 1,
      bbox: { x0: 720, y0: 100, x1: 780, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
  ];
  const result = map('Mortuary Columbary 5.0%', 93, rowWords);

  assert.equal(result.values.mortuary_columbary, undefined);
  assert.equal(result.reviews.mortuary_columbary.status, 'unmatched');
}

{
  const rowWords: PositionedWord[] = [
    {
      text: 'Weekday',
      confidence: 95,
      page: 1,
      bbox: { x0: 400, y0: 100, x1: 500, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: 'Collections',
      confidence: 95,
      page: 1,
      bbox: { x0: 505, y0: 100, x1: 620, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: '3',
      confidence: 8,
      page: 1,
      bbox: { x0: 640, y0: 100, x1: 650, y1: 125 },
      yellowCoverage: 0.7,
      pageWidth: 1000,
    },
  ];
  const result = map('Weekday Collections 3', 85, rowWords);

  assert.equal(result.values.weekday_collections, undefined);
  assert.equal(result.reviews.weekday_collections.status, 'low_confidence');
}

{
  const rowWords: PositionedWord[] = [
    {
      text: 'Baptism',
      confidence: 94,
      page: 1,
      bbox: { x0: 180, y0: 100, x1: 250, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: 'Infant',
      confidence: 94,
      page: 1,
      bbox: { x0: 255, y0: 100, x1: 305, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: '0',
      confidence: 93,
      page: 1,
      bbox: { x0: 360, y0: 100, x1: 375, y1: 125 },
      yellowCoverage: 0.8,
      pageWidth: 1000,
    },
    {
      text: '15',
      confidence: 93,
      page: 1,
      bbox: { x0: 420, y0: 100, x1: 440, y1: 125 },
      yellowCoverage: 0.8,
      pageWidth: 1000,
    },
    {
      text: '3,000.00',
      confidence: 95,
      page: 1,
      bbox: { x0: 475, y0: 100, x1: 520, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
    {
      text: '100.00',
      confidence: 91,
      page: 1,
      bbox: { x0: 545, y0: 100, x1: 590, y1: 125 },
      yellowCoverage: 0.75,
      pageWidth: 1000,
    },
    {
      text: '4,500.00',
      confidence: 95,
      page: 1,
      bbox: { x0: 700, y0: 100, x1: 770, y1: 125 },
      yellowCoverage: 0,
      pageWidth: 1000,
    },
  ];
  const result = map('Baptism Infant 0 15 3,000.00 100.00 4,500.00', 93, rowWords);

  assert.equal(result.values['A.1.02.gratis'], '0');
  assert.equal(result.values['A.1.02.chargeable'], '15');
  assert.equal(result.values['A.1.02.overAboveRate'], '100.00');
}
