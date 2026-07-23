import { iafrManualSections, iafrSacramentRows } from './iafrManualForm';
import type { PositionedWord } from '../../lib/browserOcr';

export type OcrFieldReview = {
  key: string;
  label: string;
  confidence: number;
  sourceLine: string;
  sourcePage?: number;
  rawValue: string;
  status: 'mapped' | 'low_confidence' | 'unmatched';
};

export type OcrMappingResult = {
  values: Record<string, string>;
  reviews: Record<string, OcrFieldReview>;
  summary: {
    mappedCount: number;
    lowConfidenceCount: number;
    missingCount: number;
    meanConfidence: number;
  };
};

type FieldTarget = {
  key: string;
  label: string;
  keywords: string[][];
  valueKind?: 'money' | 'sacrament_gratis' | 'sacrament_chargeable' | 'sacrament_over_above';
};

const MONEY = /-?\(?\d{1,3}(?:,\d{3})+(?:\.\d{2})?\)?|-?\(?\d+\.\d{2}\)?|-?\b\d{4,}\b/g;
const NUMBER_COLUMN = /-?\(?\d+(?:,\d{3})*(?:\.\d+)?\)?/g;
const MIN_YELLOW_COVERAGE = 0.08;

const EXTRA_TARGETS: FieldTarget[] = [
  {
    key: 'mass_intentions_total',
    label: 'Mass Intentions - Total Receipts',
    keywords: [
      ['mass', 'intentions', 'total'],
      ['total', 'receipts', 'intentions'],
    ],
  },
  {
    key: 'mass_intentions_claimed',
    label: 'Mass Intentions - Claimed by Parish Priest',
    keywords: [
      ['claimed', 'parish', 'priest'],
      ['less', 'claimed'],
    ],
  },
];

function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 %.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function labelKeywords(label: string) {
  return normalize(label)
    .split(' ')
    .filter((token) => token.length > 2 && !['and', 'the', 'from', 'with'].includes(token))
    .slice(0, 4);
}

function toNumeric(raw: string) {
  const trimmed = raw.trim();
  const negative = trimmed.startsWith('-') || (trimmed.includes('(') && trimmed.includes(')'));
  const digits = trimmed.replace(/[(),-]/g, '');
  if (!/\d/.test(digits)) return '';
  if (!/[,.]/.test(trimmed) && /^\d{4,}$/.test(digits)) {
    const whole = digits.slice(0, -2);
    const cents = digits.slice(-2);
    return `${negative ? '-' : ''}${whole}.${cents}`;
  }
  return `${negative ? '-' : ''}${digits}`;
}

function scoreLine(normLine: string, keywords: string[]) {
  const hits = keywords.filter((keyword) => normLine.includes(keyword)).length;
  const required = keywords.length <= 2 ? keywords.length : Math.ceil(keywords.length / 2) + 1;
  return { hits, enough: hits >= required, ratio: hits / Math.max(1, keywords.length) };
}

function moneyValues(line: string) {
  return line.match(MONEY) ?? [];
}

function valueForTarget(line: string, target: FieldTarget) {
  const values = target.valueKind?.startsWith('sacrament_') ? (line.match(NUMBER_COLUMN) ?? []) : moneyValues(line);
  if (target.valueKind === 'sacrament_gratis') {
    return values.length >= 2 ? values[1] : '';
  }
  if (target.valueKind === 'sacrament_chargeable') {
    return values.length >= 3 ? values[2] : (values.at(-1) ?? '');
  }
  if (target.valueKind === 'sacrament_over_above') {
    return values.length >= 5 ? values[4] : (values.at(-1) ?? '');
  }
  return values.at(-1) ?? '';
}

type VisualRow = {
  page: number;
  text: string;
  normalized: string;
  words: PositionedWord[];
};

function wordCenterY(word: PositionedWord) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function wordCenterX(word: PositionedWord) {
  return (word.bbox.x0 + word.bbox.x1) / 2;
}

function buildVisualRows(words: PositionedWord[]) {
  const rows: VisualRow[] = [];
  const ordered = [...words].sort(
    (a, b) => a.page - b.page || wordCenterY(a) - wordCenterY(b) || a.bbox.x0 - b.bbox.x0,
  );

  for (const word of ordered) {
    const height = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const tolerance = Math.max(10, height * 0.65, (word.pageHeight ?? 0) * 0.0045);
    const row = [...rows]
      .reverse()
      .find(
        (candidate) =>
          candidate.page === word.page &&
          Math.abs(
            candidate.words.reduce((sum, item) => sum + wordCenterY(item), 0) / candidate.words.length -
              wordCenterY(word),
          ) <= tolerance,
      );
    if (row) row.words.push(word);
    else rows.push({ page: word.page, text: '', normalized: '', words: [word] });
  }

  return rows.map((row) => {
    row.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const text = row.words.map((word) => word.text).join(' ');
    return { ...row, text, normalized: normalize(text) };
  });
}

function numericWordValue(word: PositionedWord) {
  if (!/\d/.test(word.text)) return '';
  const cleaned = word.text
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[^\d,().-]/g, '');
  return /\d/.test(cleaned) ? cleaned : '';
}

function yellowNumericWords(row: VisualRow) {
  return row.words
    .filter((word) => (word.yellowCoverage ?? 0) >= MIN_YELLOW_COVERAGE)
    .map((word) => ({ word, raw: numericWordValue(word) }))
    .filter((candidate) => candidate.raw)
    .sort((a, b) => a.word.bbox.x0 - b.word.bbox.x0);
}

function yellowValueForTarget(row: VisualRow, target: FieldTarget) {
  const candidates = yellowNumericWords(row);
  if (!candidates.length) return undefined;

  if (target.valueKind?.startsWith('sacrament_')) {
    const inColumn = candidates.filter(({ word }) => {
      const position = wordCenterX(word) / Math.max(1, word.pageWidth ?? 1);
      if (target.valueKind === 'sacrament_gratis') return position >= 0.33 && position < 0.405;
      if (target.valueKind === 'sacrament_chargeable') return position >= 0.395 && position < 0.49;
      return position >= 0.515 && position < 0.625;
    });
    return inColumn[0];
  }

  return candidates[0];
}

function pageForLine(line: string, words: PositionedWord[]) {
  const normLine = normalize(line);
  const hit = words.find((word) => {
    const normWord = normalize(word.text);
    return normWord.length > 2 && normLine.includes(normWord);
  });
  return hit?.page;
}

function buildTargets(): FieldTarget[] {
  const targets = new Map<string, FieldTarget>();
  const addTarget = (target: FieldTarget) => {
    if (!targets.has(target.key)) targets.set(target.key, target);
  };

  for (const target of EXTRA_TARGETS) addTarget(target);

  for (const section of iafrManualSections) {
    for (const field of section.fields) {
      addTarget({
        key: field.key,
        label: field.label,
        keywords: [labelKeywords(field.label)],
      });
    }
  }
  for (const row of iafrSacramentRows) {
    const base = labelKeywords(row.label);
    addTarget({
      key: `${row.accountCode}.gratis`,
      label: `${row.label} - Gratis`,
      keywords: [[...base, 'gratis'], base],
      valueKind: 'sacrament_gratis',
    });
    addTarget({
      key: `${row.accountCode}.chargeable`,
      label: `${row.label} - Chargeable`,
      keywords: [[...base, 'chargeable'], base],
      valueKind: 'sacrament_chargeable',
    });
    addTarget({
      key: `${row.accountCode}.overAboveRate`,
      label: `${row.label} - Charge Over/Above`,
      keywords: [[...base, 'over', 'above'], [...base, 'charge'], base],
      valueKind: 'sacrament_over_above',
    });
  }
  return [...targets.values()];
}

export function mapOcrToIafrManualFields(
  text: string,
  words: PositionedWord[] = [],
  meanConfidence = 0,
): OcrMappingResult {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const normalizedLines = lines.map(normalize);
  const hasYellowMetadata = words.some((word) => word.yellowCoverage !== undefined);
  const visualRows = hasYellowMetadata ? buildVisualRows(words) : [];
  const values: Record<string, string> = {};
  const reviews: Record<string, OcrFieldReview> = {};
  let mappedCount = 0;
  let lowConfidenceCount = 0;
  let missingCount = 0;

  for (const target of buildTargets()) {
    if (hasYellowMetadata) {
      const candidates = visualRows
        .map((row) => {
          const best = target.keywords
            .map((keywords) => scoreLine(row.normalized, keywords))
            .sort((a, b) => b.ratio - a.ratio || b.hits - a.hits)[0];
          return { row, score: best, selected: yellowValueForTarget(row, target) };
        })
        .filter((candidate) => candidate.score.enough && candidate.selected)
        .sort(
          (a, b) =>
            b.score.ratio - a.score.ratio ||
            b.score.hits - a.score.hits ||
            (b.selected?.word.yellowCoverage ?? 0) - (a.selected?.word.yellowCoverage ?? 0),
        );
      const candidate = candidates[0];
      if (!candidate?.selected) {
        reviews[target.key] = {
          key: target.key,
          label: target.label,
          confidence: 0,
          sourceLine: '',
          rawValue: '',
          status: 'unmatched',
        };
        missingCount += 1;
        continue;
      }

      const numeric = toNumeric(candidate.selected.raw);
      const wordConfidence = candidate.selected.word.confidence / 100;
      const yellowConfidence = Math.min(1, (candidate.selected.word.yellowCoverage ?? 0) / 0.45);
      const confidence = Math.min(1, wordConfidence * 0.45 + candidate.score.ratio * 0.35 + yellowConfidence * 0.2);
      const status = numeric && confidence >= 0.65 ? 'mapped' : 'low_confidence';
      if (status === 'mapped') values[target.key] = numeric;
      if (status === 'mapped') mappedCount += 1;
      else lowConfidenceCount += 1;
      reviews[target.key] = {
        key: target.key,
        label: target.label,
        confidence,
        sourceLine: candidate.row.text,
        sourcePage: candidate.row.page,
        rawValue: candidate.selected.raw,
        status,
      };
      continue;
    }

    const candidates = normalizedLines
      .map((line, index) => {
        const best = target.keywords
          .map((keywords) => scoreLine(line, keywords))
          .sort((a, b) => b.ratio - a.ratio || b.hits - a.hits)[0];
        return { index, score: best };
      })
      .filter((candidate) => candidate.score.enough)
      .sort((a, b) => b.score.ratio - a.score.ratio || b.score.hits - a.score.hits);

    const candidate = candidates[0];
    if (!candidate) {
      reviews[target.key] = {
        key: target.key,
        label: target.label,
        confidence: 0,
        sourceLine: '',
        rawValue: '',
        status: 'unmatched',
      };
      missingCount += 1;
      continue;
    }

    const sourceLine = lines[candidate.index];
    const rawValue = valueForTarget(sourceLine, target);
    const numeric = rawValue ? toNumeric(rawValue) : '';
    const confidence = Math.min(1, (meanConfidence / 100) * 0.65 + candidate.score.ratio * 0.35);
    const status = numeric && confidence >= 0.65 ? 'mapped' : 'low_confidence';
    if (numeric) values[target.key] = numeric;
    if (status === 'mapped') mappedCount += 1;
    else lowConfidenceCount += 1;
    reviews[target.key] = {
      key: target.key,
      label: target.label,
      confidence,
      sourceLine,
      sourcePage: pageForLine(sourceLine, words),
      rawValue,
      status,
    };
  }

  return {
    values,
    reviews,
    summary: {
      mappedCount,
      lowConfidenceCount,
      missingCount,
      meanConfidence: Math.max(0, Math.min(1, meanConfidence / 100)),
    },
  };
}
