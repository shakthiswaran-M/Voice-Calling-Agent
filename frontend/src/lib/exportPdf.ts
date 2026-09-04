// src/lib/exportPdf.ts
//
// jsPDF-ONLY chat export — the conversation is laid out directly on A4 pages
// with jsPDF drawing primitives (no DOM capture of any kind).
//
// The conversation is laid out directly on A4 pages with jsPDF drawing
// primitives:
//   - chat title + export metadata centered at the top
//   - centered date separators between messages (same rule as the chat UI)
//   - user messages: right-aligned green bubbles, max 65% of content width
//   - bot messages: left-aligned white bubbles with border, max 72% width
//   - markdown-lite rendering (headings, bold/italic/code, lists, quotes,
//     code fences, tables)
//   - pagination: messages that don't fit move to the next page; a message
//     taller than a full page is split across pages at row boundaries so no
//     conversation content is ever lost
//
// Because nothing is ever "screenshotted", the export can never be truncated
// to the visible viewport or a scroll container.

import { jsPDF } from 'jspdf';
import type { Thread } from '../types';
import { TIMELINE_GAP_MS } from './utils';

/* ─────────────────────────── palette ─────────────────────────── */

type RGB = [number, number, number];

const TEXT: RGB = [31, 41, 55];          // gray-800
const HEADING: RGB = [17, 24, 39];       // gray-900
const MUTED: RGB = [107, 114, 128];      // gray-500
const USER_LABEL: RGB = [21, 128, 61];   // green-700
const BOT_LABEL: RGB = [22, 163, 74];    // green-600
const USER_FILL: RGB = [220, 252, 231];  // green-100
const BOT_FILL: RGB = [255, 255, 255];
const BOT_BORDER: RGB = [229, 231, 235]; // gray-200
const CODE_BG: RGB = [246, 248, 250];
const CODE_BORDER: RGB = [229, 231, 235];
const CODE_TEXT: RGB = [36, 41, 47];
const TABLE_HEAD_BG: RGB = [249, 250, 251];
const TABLE_BORDER: RGB = [229, 231, 235];
const QUOTE_BAR: RGB = [134, 239, 172];
const SEP_LINE: RGB = [229, 231, 235];

const BASE_LINE_H = 12.5;   // for 10pt text
const CODE_LINE_H = 10.2;   // for 8.5pt monospace
const ITEM_GAP = 5;         // gap between markdown blocks inside a bubble

/* ─────────────────────── inline markdown tokens ─────────────────────── */

type FontStyle = 'normal' | 'bold' | 'italic';

interface Token {
  text: string;
  style: FontStyle;
  font: 'helvetica' | 'courier';
  space: boolean;
}

function parseInlineRuns(md: string): { text: string; style: FontStyle; font: 'helvetica' | 'courier' }[] {
  const s = md
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, '$1')
    .replace(/\[([^\]]*)\]\(([^)]*)\)/g, '$1 ($2)');

  const runs: { text: string; style: FontStyle; font: 'helvetica' | 'courier' }[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) { runs.push({ text: buf, style: 'normal', font: 'helvetica' }); buf = ''; }
  };

  while (i < s.length) {
    const c = s[i];
    if (c === '`') {
      const end = s.indexOf('`', i + 1);
      if (end === -1) { buf += c; i++; continue; }
      flush();
      runs.push({ text: s.slice(i + 1, end), style: 'normal', font: 'courier' });
      i = end + 1;
    } else if (c === '*' ) {
      const dbl = s[i + 1] === '*';
      const closer = dbl ? '**' : '*';
      const end = s.indexOf(closer, i + (dbl ? 2 : 1));
      if (end === -1) { buf += c; i++; continue; }
      flush();
      runs.push({ text: s.slice(i + (dbl ? 2 : 1), end), style: dbl ? 'bold' : 'italic', font: 'helvetica' });
      i = end + (dbl ? 2 : 1);
    } else if (c === '_' && s[i + 1] === '_') {
      const end = s.indexOf('__', i + 2);
      if (end === -1) { buf += c; i++; continue; }
      flush();
      runs.push({ text: s.slice(i + 2, end), style: 'bold', font: 'helvetica' });
      i = end + 2;
    } else {
      buf += c;
      i++;
    }
  }
  flush();
  return runs;
}

function tokenize(md: string): Token[] {
  const runs = parseInlineRuns(md);
  const tokens: Token[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (!part) continue;
      const isSpace = /^\s+$/.test(part);
      tokens.push({ text: isSpace ? ' ' : part, style: run.style, font: run.font, space: isSpace });
    }
  }
  return tokens;
}

/* ─────────────────────── markdown block parser ─────────────────────── */

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'list'; items: { text: string; ordered: boolean; num: number }[] }
  | { type: 'code'; lines: string[] }
  | { type: 'quote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'table'; header: string[]; rows: string[][] };

function isBlockStart(line: string): boolean {
  return /^(#{1,6})\s/.test(line) || /^```/.test(line) || /^\s*>\s?/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) || /^\s*(---|\*\*\*|___)\s*$/.test(line);
}

function parseBlocks(md: string): Block[] {
  const lines = md.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { code.push(lines[i]); i++; }
      i++; // skip closing fence
      blocks.push({ type: 'code', lines: code });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
      const items: { text: string; ordered: boolean; num: number }[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!m) break;
        items.push({ text: m[2], ordered: /^\d/.test(m[1]), num: parseInt(m[1], 10) || 1 });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    // GFM table: header line followed by a separator line like |---|---|
    if (line.includes('|') && i + 1 < lines.length) {
      const sep = lines[i + 1];
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(sep) && sep.includes('-')) {
        const header = line.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i].includes('|')) {
          rows.push(lines[i].split('|').map((s) => s.trim()).filter((s) => s.length > 0));
          i++;
        }
        blocks.push({ type: 'table', header, rows });
        continue;
      }
    }

    // Paragraph: collect until a blank line or the next block start.
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length > 0) blocks.push({ type: 'para', text: para.join(' ') });
    else i++;
  }
  return blocks;
}

/* ─────────────────────── measuring / wrapping ─────────────────────── */

function tokensWidth(doc: jsPDF, tokens: Token[], fontSize: number): number {
  doc.setFontSize(fontSize);
  let w = 0;
  for (const t of tokens) {
    doc.setFont(t.font, t.style);
    w += doc.getTextWidth(t.text);
  }
  return w;
}

function wrapTokens(doc: jsPDF, tokens: Token[], maxW: number, fontSize: number): Token[][] {
  doc.setFontSize(fontSize);
  const lines: Token[][] = [];
  let line: Token[] = [];
  let w = 0;
  const width = (t: Token) => { doc.setFont(t.font, t.style); return doc.getTextWidth(t.text); };
  const flush = () => { if (line.length > 0) { lines.push(line); line = []; w = 0; } };

  for (const t of tokens) {
    if (line.length === 0 && t.space) continue; // drop leading spaces
    const tw = width(t);
    if (w + tw <= maxW) { line.push(t); w += tw; continue; }
    if (t.space) { flush(); continue; }
    if (tw > maxW) {
      // A single word wider than the line: hard-split it.
      flush();
      doc.setFont(t.font, t.style);
      const parts = doc.splitTextToSize(t.text, maxW) as string[];
      parts.forEach((p, idx) => {
        const tok: Token = { text: p, style: t.style, font: t.font, space: false };
        if (idx === parts.length - 1) { line.push(tok); w = doc.getTextWidth(p); }
        else lines.push([tok]);
      });
    } else {
      flush();
      line.push(t);
      w = tw;
    }
  }
  flush();
  return lines;
}

/* ─────────────────────── drawing rows / items ─────────────────────── */

/** A Row is one atomic drawable unit with a known height. */
interface Row {
  h: number;
  draw(x: number, y: number): void; // x = bubble inner left, y = row top
}

interface Item {
  rows: Row[];
  height: number;
}

function makeTextRows(
  doc: jsPDF,
  tokens: Token[],
  innerW: number,
  fontSize: number,
  color: RGB,
  track?: { maxW: number },
): Row[] {
  const lines = wrapTokens(doc, tokens, innerW, fontSize);
  if (track) {
    for (const lineTokens of lines) {
      const w = tokensWidth(doc, lineTokens, fontSize);
      if (w > track.maxW) track.maxW = w;
    }
  }
  return lines.map((lineTokens) => ({
    h: BASE_LINE_H,
    draw: (x, y) => drawTokens(doc, lineTokens, x, y, fontSize, color),
  }));
}

function drawTokens(doc: jsPDF, tokens: Token[], x: number, y: number, fontSize: number, color: RGB): void {
  doc.setFontSize(fontSize);
  doc.setTextColor(color[0], color[1], color[2]);
  let cx = x;
  for (const t of tokens) {
    doc.setFont(t.font, t.style);
    if (t.space) { cx += doc.getTextWidth(' '); continue; }
    doc.text(t.text, cx, y);
    cx += doc.getTextWidth(t.text);
  }
}

/** Builds the drawable rows for one message bubble inside `innerW`. */
function buildItemRows(doc: jsPDF, block: Block, innerW: number, track?: { maxW: number }): Row[] {
  switch (block.type) {
    case 'para':
      return makeTextRows(doc, tokenize(block.text), innerW, 10, TEXT, track);

    case 'heading': {
      const size = block.level <= 1 ? 13 : block.level === 2 ? 12 : 11;
      return makeTextRows(doc, tokenize(block.text), innerW, size, HEADING, track);
    }

    case 'list': {
      const rows: Row[] = [];
      for (const item of block.items) {
        const prefix = item.ordered ? `${item.num}. ` : '\u2022 ';
        doc.setFont('helvetica', 'bold');
        const prefixW = doc.getTextWidth(prefix);
        const inner = Math.max(20, innerW - prefixW);
        const lines = wrapTokens(doc, tokenize(item.text), inner, 10);
        if (track) {
          for (const lineTokens of lines) {
            const w = tokensWidth(doc, lineTokens, 10) + prefixW;
            if (w > track.maxW) track.maxW = w;
          }
        }
        const textRows = lines.map((lineTokens) => ({
          h: BASE_LINE_H,
          draw: (x: number, y: number) => drawTokens(doc, lineTokens, x, y, 10, TEXT),
        }));
        if (textRows.length === 0) continue;
        rows.push({
          h: textRows.length * BASE_LINE_H,
          draw: (x, y) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(TEXT[0], TEXT[1], TEXT[2]);
            doc.text(prefix, x, y + 9);
            let yy = y + 9;
            for (const r of textRows) { r.draw(x + prefixW, yy); yy += BASE_LINE_H; }
          },
        });
      }
      return rows;
    }

    case 'quote': {
      const text = block.lines.join(' ');
      const lines = wrapTokens(doc, tokenize(text), Math.max(20, innerW - 10), 10);
      if (track) {
        for (const lineTokens of lines) {
          const w = tokensWidth(doc, lineTokens, 10) + 10;
          if (w > track.maxW) track.maxW = w;
        }
      }
      const textRows = lines.map((lineTokens) => ({
        h: BASE_LINE_H,
        draw: (x: number, y: number) => drawTokens(doc, lineTokens, x + 10, y, 10, MUTED),
      }));
      if (textRows.length === 0) return [];
      return [{
        h: textRows.length * BASE_LINE_H + 4,
        draw: (x, y) => {
          doc.setFillColor(QUOTE_BAR[0], QUOTE_BAR[1], QUOTE_BAR[2]);
          doc.rect(x, y, 2.5, textRows.length * BASE_LINE_H + 4, 'F');
          let yy = y + 2 + 9;
          for (const r of textRows) { r.draw(x, yy); yy += BASE_LINE_H; }
        },
      }];
    }

    case 'code': {
      const size = 8.5;
      const pad = 6;
      doc.setFont('courier', 'normal');
      doc.setFontSize(size);
      const wrapped: string[] = [];
      for (const raw of block.lines) {
        const parts = doc.splitTextToSize(raw.length === 0 ? ' ' : raw, innerW - pad * 2) as string[];
        wrapped.push(...parts);
      }
      const h = pad * 2 + wrapped.length * CODE_LINE_H;
      return [{
        h,
        draw: (x, y) => {
          doc.setFillColor(CODE_BG[0], CODE_BG[1], CODE_BG[2]);
          doc.setDrawColor(CODE_BORDER[0], CODE_BORDER[1], CODE_BORDER[2]);
          doc.setLineWidth(0.3);
          doc.roundedRect(x, y, innerW, h, 4, 4, 'FD');
          doc.setFont('courier', 'normal');
          doc.setFontSize(size);
          doc.setTextColor(CODE_TEXT[0], CODE_TEXT[1], CODE_TEXT[2]);
          let yy = y + pad + 7;
          for (const lineText of wrapped) {
            doc.text(lineText, x + pad, yy);
            yy += CODE_LINE_H;
          }
        },
      }];
    }

    case 'hr': {
      return [{
        h: 10,
        draw: (x, y) => {
          doc.setDrawColor(SEP_LINE[0], SEP_LINE[1], SEP_LINE[2]);
          doc.setLineWidth(0.5);
          doc.line(x, y + 5, x + innerW, y + 5);
        },
      }];
    }

    case 'table': {
      return buildTableRows(doc, block, innerW);
    }
  }
}

function buildTableRows(doc: jsPDF, block: Extract<Block, { type: 'table' }>, innerW: number): Row[] {
  const size = 9;
  const colCount = Math.max(block.header.length, ...block.rows.map((r) => r.length));
  const cells: string[][] = block.rows.map((r) => {
    const out: string[] = [];
    for (let c = 0; c < colCount; c++) out.push(r[c] !== undefined ? r[c] : '');
    return out;
  });
  const header: string[] = [];
  for (let c = 0; c < colCount; c++) header.push(block.header[c] !== undefined ? block.header[c] : '');

  // Column widths from content (capped per column, then stretched to fill).
  const cellPadding = 8;
  const colWidths: number[] = [];
  const lineH = 11.2;
  for (let c = 0; c < colCount; c++) {
    let maxW = 0;
    const all = [header[c], ...cells.map((r) => r[c])];
    for (const text of all) {
      const lines = wrapTokens(doc, tokenize(text), innerW * 0.55, size);
      for (const l of lines) {
        const w = tokensWidth(doc, l, size);
        if (w > maxW) maxW = w;
      }
    }
    colWidths.push(Math.min(Math.max(maxW + cellPadding, 30), innerW * 0.55));
  }
  const total = colWidths.reduce((a, b) => a + b, 0);
  const scale = total > innerW ? innerW / total : innerW / total;
  for (let c = 0; c < colCount; c++) colWidths[c] = colWidths[c] * scale;

  const wrapCell = (text: string, w: number): Token[][] =>
    wrapTokens(doc, tokenize(text), Math.max(10, w - cellPadding), size);

  const rowData: { cells: Token[][][]; h: number; isHeader: boolean }[] = [];
  rowData.push({
    isHeader: true,
    cells: header.map((text, c) => wrapCell(text, colWidths[c])),
    h: 0,
  });
  for (const r of cells) {
    rowData.push({
      isHeader: false,
      cells: r.map((text, c) => wrapCell(text, colWidths[c])),
      h: 0,
    });
  }
  for (const rd of rowData) {
    rd.h = Math.max(...rd.cells.map((cell) => cell.length)) * lineH + 6;
  }

  return rowData.map((rd) => ({
    h: rd.h,
    draw: (x, y) => {
      let cx = x;
      rd.cells.forEach((cell, c) => {
        doc.setDrawColor(TABLE_BORDER[0], TABLE_BORDER[1], TABLE_BORDER[2]);
        doc.setLineWidth(0.3);
        if (rd.isHeader) {
          doc.setFillColor(TABLE_HEAD_BG[0], TABLE_HEAD_BG[1], TABLE_HEAD_BG[2]);
          doc.rect(cx, y, colWidths[c], rd.h, 'FD');
        } else {
          doc.rect(cx, y, colWidths[c], rd.h, 'S');
        }
        let yy = y + 3 + lineH * 0.8;
        for (const lineTokens of cell) {
          drawTokens(doc, lineTokens, cx + cellPadding / 2, yy, size, rd.isHeader ? HEADING : TEXT);
          yy += lineH;
        }
        cx += colWidths[c];
      });
    },
  }));
}

/** Combines item rows into one flat row list (with small gaps between items). */
function flattenRows(items: Item[]): Row[] {
  const rows: Row[] = [];
  items.forEach((item, idx) => {
    if (idx > 0) rows.push({ h: ITEM_GAP, draw: () => { /* spacer */ } });
    rows.push(...item.rows);
  });
  return rows;
}

/* ─────────────────────── document layout ─────────────────────── */

interface DocState {
  doc: jsPDF;
  left: number;
  right: number;
  top: number;
  bottom: number;
  contentW: number;
  contentH: number;
  y: number;
}

function createState(createDoc?: () => jsPDF): DocState {
  // `createDoc` is an optional test seam; production always uses the default.
  const doc = createDoc
    ? createDoc()
    : new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  return {
    doc,
    left: margin,
    right: pageW - margin,
    top: margin,
    bottom: pageH - margin,
    contentW: pageW - margin * 2,
    contentH: pageH - margin * 2,
    y: margin,
  };
}

function newPage(state: DocState): void {
  state.doc.addPage();
  state.y = state.top;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function drawTitle(state: DocState, thread: Thread): void {
  const { doc } = state;
  doc.setProperties({ title: thread.title || 'Chat export' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(HEADING[0], HEADING[1], HEADING[2]);
  const titleLines = doc.splitTextToSize(thread.title || 'Chat Export', state.contentW) as string[];
  titleLines.forEach((lineText) => {
    doc.text(lineText, (state.left + state.right) / 2, state.y, { align: 'center' });
    state.y += 18;
  });

  const count = thread.messages.length;
  const meta = `Exported on ${new Date().toLocaleString()} \u2022 ${count} message${count === 1 ? '' : 's'}`;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(meta, (state.left + state.right) / 2, state.y, { align: 'center' });
  state.y += 12;

  doc.setDrawColor(SEP_LINE[0], SEP_LINE[1], SEP_LINE[2]);
  doc.setLineWidth(0.6);
  doc.line(state.left, state.y, state.right, state.y);
  state.y += 18;
}

function drawSeparator(state: DocState, msg: { timestamp: number }, prev: { timestamp: number } | null): void {
  const { doc } = state;
  const date = new Date(msg.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const sameDay = prev && new Date(prev.timestamp).toDateString() === date.toDateString();
  const label = sameDay ? timeStr : `${dateStr} \u00b7 ${timeStr}`;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  const textW = doc.getTextWidth(label);

  const blockH = 24;
  if (state.y + blockH > state.bottom) newPage(state);

  const centerX = (state.left + state.right) / 2;
  doc.setDrawColor(SEP_LINE[0], SEP_LINE[1], SEP_LINE[2]);
  doc.setLineWidth(0.5);
  doc.line(state.left, state.y + 10, centerX - textW / 2 - 8, state.y + 10);
  doc.line(centerX + textW / 2 + 8, state.y + 10, state.right, state.y + 10);

  doc.setFillColor(243, 244, 246); // gray-100 chip
  doc.roundedRect(centerX - textW / 2 - 7, state.y + 3, textW + 14, 13, 6, 6, 'F');
  doc.text(label, centerX, state.y + 12.5, { align: 'center' });

  state.y += blockH;
}

function drawMessage(state: DocState, msg: { role: 'user' | 'bot'; content: string; timestamp: number }): void {
  const { doc } = state;
  const content = msg.content.trim();
  if (!content) return;

  const isUser = msg.role === 'user';
  const maxBubbleW = isUser ? state.contentW * 0.65 : state.contentW * 0.72;
  const padX = 12;
  const padY = 10;

  // Label above the bubble.
  const label = `${isUser ? 'You' : 'NetKathir'} \u00b7 ${formatTime(msg.timestamp)}`;
  const labelH = 11;
  if (state.y + labelH > state.bottom) newPage(state);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(isUser ? USER_LABEL[0] : BOT_LABEL[0], isUser ? USER_LABEL[1] : BOT_LABEL[1], isUser ? USER_LABEL[2] : BOT_LABEL[2]);
  doc.text(label, isUser ? state.right : state.left, state.y + 9, { align: isUser ? 'right' : 'left' });
  state.y += labelH;

  // Lay out the bubble content (wrap once at max width, then narrow the
  // bubble to the widest line like the chat UI does).
  const blocks = parseBlocks(content);
  let innerW = maxBubbleW - padX * 2;
  const buildRows = (w: number): { rows: Row[]; maxLineW: number; wide: boolean } => {
    const track = { maxW: 0 };
    const items: Item[] = blocks.map((b) => {
      const rows = buildItemRows(doc, b, w, track);
      return { rows, height: rows.reduce((a, r) => a + r.h, 0) };
    });
    const wide = blocks.some((b) => b.type === 'code' || b.type === 'table');
    return { rows: flattenRows(items), maxLineW: track.maxW, wide };
  };

  let built = buildRows(innerW);
  let bubbleW = maxBubbleW;
  if (!built.wide) {
    const needed = Math.min(Math.max(built.maxLineW + padX * 2, 60), maxBubbleW);
    bubbleW = needed;
    if (maxBubbleW - needed > 1) {
      innerW = bubbleW - padX * 2;
      built = buildRows(innerW);
    }
  }
  const bubbleH = built.rows.reduce((a, r) => a + r.h, 0) + padY * 2;
  const bubbleX = isUser ? state.right - bubbleW : state.left;

  const drawBubbleBackground = (y: number, h: number): void => {
    if (isUser) {
      doc.setFillColor(USER_FILL[0], USER_FILL[1], USER_FILL[2]);
      doc.roundedRect(bubbleX, y, bubbleW, h, 8, 8, 'F');
    } else {
      doc.setFillColor(BOT_FILL[0], BOT_FILL[1], BOT_FILL[2]);
      doc.setDrawColor(BOT_BORDER[0], BOT_BORDER[1], BOT_BORDER[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(bubbleX, y, bubbleW, h, 8, 8, 'FD');
    }
  };

  const drawRows = (rows: Row[], y: number): void => {
    let yy = y + padY + 8;
    for (const row of rows) {
      row.draw(bubbleX + padX, yy);
      yy += row.h;
    }
  };

  const remaining = state.bottom - state.y;
  if (bubbleH <= remaining) {
    drawBubbleBackground(state.y, bubbleH);
    drawRows(built.rows, state.y);
    state.y += bubbleH + 14;
    return;
  }

  // Doesn't fit here — move the whole bubble to the next page when it fits there.
  if (bubbleH <= state.contentH) {
    newPage(state);
    drawBubbleBackground(state.y, bubbleH);
    drawRows(built.rows, state.y);
    state.y += bubbleH + 14;
    return;
  }

  // The bubble is taller than a full page: split it at row boundaries so no
  // content is lost.
  const capacity = state.contentH;
  const segments: Row[][] = [];
  let cur: Row[] = [];
  let h = 0;
  for (const row of built.rows) {
    if (cur.length > 0 && h + row.h > capacity) { segments.push(cur); cur = []; h = 0; }
    cur.push(row);
    h += row.h;
  }
  if (cur.length > 0) segments.push(cur);

  let first = true;
  for (const seg of segments) {
    if (!first) newPage(state);
    first = false;
    const segH = seg.reduce((a, r) => a + r.h, 0) + padY * 2;
    drawBubbleBackground(state.y, segH);
    drawRows(seg, state.y);
    state.y += segH;
    if (seg !== segments[segments.length - 1]) state.y += 8;
  }
  state.y += 14;
}

function slugifyTitle(title: string): string {
  const slug = (title || 'chat')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || 'chat';
}

/**
 * Exports the thread's full conversation to a paginated A4 PDF using jsPDF
 * only (no DOM capture, so the whole conversation is always included,
 * regardless of scroll position or viewport size).
 */
export function exportThreadToPdf(thread: Thread, createDoc?: () => jsPDF): void {
  const state = createState(createDoc);

  drawTitle(state, thread);

  let prevMsg: { timestamp: number } | null = null;
  for (const msg of thread.messages) {
    if (!msg.content.trim()) continue;
    const gap = !prevMsg || msg.timestamp - prevMsg.timestamp > TIMELINE_GAP_MS;
    if (gap) drawSeparator(state, msg, prevMsg);
    drawMessage(state, msg);
    prevMsg = msg;
  }

  if (thread.messages.length === 0) {
    const { doc } = state;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text('No messages in this conversation.', (state.left + state.right) / 2, state.y, { align: 'center' });
  }

  state.doc.save(`${slugifyTitle(thread.title)}.pdf`);
}