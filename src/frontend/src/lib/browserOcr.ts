'use client';

import { createWorker, PSM, type Worker } from 'tesseract.js';
import type { PDFPageProxy } from 'pdfjs-dist/types/src/display/api';

export type OcrProgress = {
  phase: 'loading' | 'rendering' | 'recognizing' | 'extracting';
  label: string;
  page?: number;
  pageCount?: number;
  progress?: number;
};

export type PositionedWord = {
  text: string;
  confidence: number;
  page: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  yellowCoverage?: number;
  pageWidth?: number;
  pageHeight?: number;
};

export type BrowserOcrPage = {
  page: number;
  text: string;
  confidence: number;
  words: PositionedWord[];
};

export type BrowserOcrResult = {
  source: 'pdf-text' | 'pdf-ocr';
  pages: BrowserOcrPage[];
};

const PDF_WORKER_SRC = '/pdf.worker.min.mjs';
const PDF_MODULE_SRC = '/pdf.min.mjs';
const TARGET_WIDTH = 2400;
const MIN_YELLOW_COVERAGE = 0.08;

type ProgressFn = (progress: OcrProgress) => void;

function flattenWords(data: { blocks?: unknown }, page: number): PositionedWord[] {
  type RawWord = { text: string; confidence: number; bbox: PositionedWord['bbox'] };
  type RawLine = { words?: RawWord[] };
  type RawPara = { lines?: RawLine[] };
  type RawBlock = { paragraphs?: RawPara[] };

  const blocks = (data.blocks ?? []) as RawBlock[];
  return blocks.flatMap((block) =>
    (block.paragraphs ?? []).flatMap((paragraph) =>
      (paragraph.lines ?? []).flatMap((line) =>
        (line.words ?? []).map((word) => ({
          text: word.text,
          confidence: Math.round(word.confidence),
          page,
          bbox: word.bbox,
        })),
      ),
    ),
  );
}

function isYellowPixel(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const saturation = max === 0 ? 0 : (max - min) / max;
  return red >= 145 && green >= 120 && blue <= 190 && red - blue >= 35 && green - blue >= 20 && saturation >= 0.18;
}

function annotateYellowCoverage(words: PositionedWord[], source: HTMLCanvasElement, recognized: HTMLCanvasElement) {
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return words;
  const pixels = ctx.getImageData(0, 0, source.width, source.height).data;
  const scaleX = source.width / Math.max(1, recognized.width);
  const scaleY = source.height / Math.max(1, recognized.height);

  return words.map((word) => {
    const x0 = Math.max(0, Math.floor(word.bbox.x0 * scaleX) - 3);
    const y0 = Math.max(0, Math.floor(word.bbox.y0 * scaleY) - 3);
    const x1 = Math.min(source.width, Math.ceil(word.bbox.x1 * scaleX) + 3);
    const y1 = Math.min(source.height, Math.ceil(word.bbox.y1 * scaleY) + 3);
    const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 12));
    let yellow = 0;
    let sampled = 0;
    for (let y = y0; y < y1; y += step) {
      for (let x = x0; x < x1; x += step) {
        const offset = (y * source.width + x) * 4;
        sampled += 1;
        if (isYellowPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) yellow += 1;
      }
    }
    return {
      ...word,
      yellowCoverage: sampled ? yellow / sampled : 0,
      pageWidth: recognized.width,
      pageHeight: recognized.height,
    };
  });
}

async function createOcrWorker(onProgress?: ProgressFn): Promise<Worker> {
  const worker = await createWorker('eng', undefined, {
    logger: (message: { status?: string; progress?: number }) => {
      if (message.status === 'recognizing text') return;
      if (message.status) onProgress?.({ phase: 'loading', label: 'Preparing OCR engine...' });
    },
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.AUTO,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  });
  return worker;
}

function preprocess(source: HTMLCanvasElement, mode: 'print' | 'soft') {
  const scale = source.width && source.width < TARGET_WIDTH ? TARGET_WIDTH / source.width : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  let min = 255;
  let max = 0;
  const gray = new Float32Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray[j] = value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const range = Math.max(1, max - min);
  const contrast = mode === 'print' ? 1.18 : 1.08;
  const bias = mode === 'print' ? -12 : -6;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    let value = ((gray[j] - min) / range) * 255 * contrast + bias;
    value = Math.max(0, Math.min(255, value));
    if (mode === 'print') value = value >= 178 ? 255 : 0;
    data[i] = data[i + 1] = data[i + 2] = value;
    data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function isolateYellowNumericRegions(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  const outputCtx = canvas.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx || !outputCtx) return canvas;

  const image = sourceCtx.getImageData(0, 0, source.width, source.height);
  const output = outputCtx.createImageData(source.width, source.height);
  output.data.fill(255);
  const width = source.width;
  const height = source.height;
  const stride = width + 1;
  const integral = new Uint32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      if (isYellowPixel(image.data[offset], image.data[offset + 1], image.data[offset + 2])) rowSum += 1;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + rowSum;
    }
  }

  const radius = Math.max(5, Math.round(width / 300));
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const nearbyYellow =
        integral[bottom * stride + right] -
        integral[top * stride + right] -
        integral[bottom * stride + left] +
        integral[top * stride + left];
      if (!nearbyYellow) continue;
      const offset = (y * width + x) * 4;
      const luminance = image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114;
      const value = luminance < 155 ? 0 : 255;
      output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = value;
      output.data[offset + 3] = 255;
    }
  }

  const horizontalLimit = Math.max(25, Math.round(width * 0.015));
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const black = x < width && output.data[(y * width + x) * 4] < 128;
      if (black && start < 0) start = x;
      if (!black && start >= 0) {
        if (x - start >= horizontalLimit) {
          for (let clearX = start; clearX < x; clearX++) {
            const offset = (y * width + clearX) * 4;
            output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = 255;
          }
        }
        start = -1;
      }
    }
  }

  const verticalLimit = Math.max(35, Math.round(height * 0.012));
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const black = y < height && output.data[(y * width + x) * 4] < 128;
      if (black && start < 0) start = y;
      if (!black && start >= 0) {
        if (y - start >= verticalLimit) {
          for (let clearY = start; clearY < y; clearY++) {
            const offset = (clearY * width + x) * 4;
            output.data[offset] = output.data[offset + 1] = output.data[offset + 2] = 255;
          }
        }
        start = -1;
      }
    }
  }
  outputCtx.putImageData(output, 0, 0);
  return canvas;
}

async function recognizeCanvas(worker: Worker, canvas: HTMLCanvasElement, page: number, mode: 'print' | 'soft') {
  await worker.setParameters({ tessedit_pageseg_mode: mode === 'print' ? PSM.SINGLE_BLOCK : PSM.AUTO });
  const processed = preprocess(canvas, mode);
  const { data } = await worker.recognize(processed, {}, { blocks: true });
  return {
    page,
    text: data.text,
    confidence: Math.round(data.confidence),
    words: annotateYellowCoverage(flattenWords(data, page), canvas, processed),
  };
}

async function recognizeYellowNumbers(worker: Worker, canvas: HTMLCanvasElement, page: number) {
  const isolated = isolateYellowNumericRegions(canvas);
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: '0123456789,.-()',
  });
  const { data } = await worker.recognize(isolated, {}, { blocks: true });
  await worker.setParameters({ tessedit_char_whitelist: '' });
  return annotateYellowCoverage(flattenWords(data, page), canvas, isolated).filter(
    (word) => /\d/.test(word.text) && (word.yellowCoverage ?? 0) >= MIN_YELLOW_COVERAGE,
  );
}

async function ocrCanvas(worker: Worker, canvas: HTMLCanvasElement, page: number): Promise<BrowserOcrPage> {
  const print = await recognizeCanvas(worker, canvas, page, 'print');
  const soft = await recognizeCanvas(worker, canvas, page, 'soft');
  const yellowNumbers = await recognizeYellowNumbers(worker, canvas, page);
  const best = soft.text.replace(/\s/g, '').length >= print.text.replace(/\s/g, '').length ? soft : print;
  const secondary = best === soft ? print : soft;
  const secondaryText = secondary.text.trim();
  const text =
    secondaryText && !best.text.includes(secondaryText) && secondary.confidence >= best.confidence - 10
      ? `${best.text.trim()}\n\n----- Alternate OCR pass -----\n${secondaryText}`
      : best.text;
  const words = [...best.words];
  const supplemental = [
    ...secondary.words.filter(
      (candidate) => /\d/.test(candidate.text) && (candidate.yellowCoverage ?? 0) >= MIN_YELLOW_COVERAGE,
    ),
    ...yellowNumbers,
  ];
  for (const word of supplemental) {
    const duplicate = words.some(
      (existing) =>
        existing.page === word.page && /\d/.test(existing.text) && overlapRatio(existing.bbox, word.bbox) >= 0.55,
    );
    if (!duplicate) words.push(word);
  }
  return { ...best, text, words };
}

function overlapRatio(a: PositionedWord['bbox'], b: PositionedWord['bbox']) {
  const width = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const height = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const intersection = width * height;
  const smaller = Math.min(Math.max(1, (a.x1 - a.x0) * (a.y1 - a.y0)), Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0)));
  return intersection / smaller;
}

async function loadPdfjs() {
  const pdfjs = (await import(/* webpackIgnore: true */ PDF_MODULE_SRC)) as typeof import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjs;
}

async function renderPdfPage(page: PDFPageProxy): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const scale = base.width ? Math.max(1, TARGET_WIDTH / base.width) : 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas for PDF rendering.');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

export async function recognizePdfFile(file: File, onProgress?: ProgressFn): Promise<BrowserOcrResult> {
  onProgress?.({ phase: 'loading', label: 'Opening PDF...' });
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  try {
    const embeddedText: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      embeddedText.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    if (embeddedText.join('').replace(/\s/g, '').length > 30) {
      return {
        source: 'pdf-text',
        pages: embeddedText.map((text, index) => ({
          page: index + 1,
          text,
          confidence: 100,
          words: [],
        })),
      };
    }

    const worker = await createOcrWorker(onProgress);
    try {
      const pages: BrowserOcrPage[] = [];
      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
        onProgress?.({
          phase: 'rendering',
          label: `Rendering page ${pageNumber} of ${doc.numPages}...`,
          page: pageNumber,
          pageCount: doc.numPages,
        });
        const canvas = await renderPdfPage(await doc.getPage(pageNumber));
        onProgress?.({
          phase: 'recognizing',
          label: `Reading page ${pageNumber} of ${doc.numPages}...`,
          page: pageNumber,
          pageCount: doc.numPages,
        });
        pages.push(await ocrCanvas(worker, canvas, pageNumber));
      }
      return { source: 'pdf-ocr', pages };
    } finally {
      await worker.terminate();
    }
  } finally {
    await doc.destroy();
  }
}

export function combineOcrPages(pages: BrowserOcrPage[]) {
  const text = pages
    .map((page) => (pages.length > 1 ? `----- Page ${page.page} -----\n${page.text}` : page.text))
    .join('\n\n');
  const words = pages.flatMap((page) => page.words);
  const meanConfidence = Math.round(pages.reduce((sum, page) => sum + page.confidence, 0) / Math.max(1, pages.length));
  return { text, words, meanConfidence, pageCount: pages.length };
}
