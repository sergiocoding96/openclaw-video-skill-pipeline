/**
 * Phase 2 — normalize Screenpipe /search payload into a clean event timeline.
 * @see https://screenpipe-screenpipe.mintlify.app/api/search
 */

'use strict';

const MIN_TEXT_LEN = 2;
const MAX_TEXT_LEN = 8000;

/**
 * @param {unknown} rawData — typically search.json root: { data: [...], pagination }
 * @returns {Array<NormalizedEvent>}
 */
function normalizeEvents(rawData) {
  const items = extractItems(rawData);
  const mapped = [];

  for (const item of items) {
    const ev = mapSearchItem(item);
    if (!ev) continue;
    if (isNoise(ev)) continue;
    mapped.push(ev);
  }

  mapped.sort((a, b) => compareTimestamp(a.timestamp, b.timestamp));
  return dedupeWeakConsecutive(mapped);
}

function extractItems(rawData) {
  if (!rawData || typeof rawData !== 'object') return [];
  if (Array.isArray(rawData.data)) return rawData.data;
  if (Array.isArray(rawData)) return rawData;
  return [];
}

/**
 * @param {object} item
 * @returns {NormalizedEvent|null}
 */
function mapSearchItem(item) {
  const type = String(item?.type || '').trim();
  const c = item?.content && typeof item.content === 'object' ? item.content : {};

  const timestamp =
    pickString(c.timestamp) ||
    pickString(c.start_time) ||
    pickString(item.timestamp) ||
    null;

  const appName = pickString(c.app_name) || pickString(c.appName) || null;
  const windowTitle =
    pickString(c.window_name) ||
    pickString(c.window_title) ||
    pickString(c.windowTitle) ||
    null;
  const url =
    pickString(c.browser_url) ||
    pickString(c.browserUrl) ||
    pickString(c.url) ||
    null;

  let text = '';
  const upper = type.toUpperCase();
  if (upper === 'AUDIO') {
    text = pickString(c.transcription) || pickString(c.text) || '';
  } else if (upper === 'OCR' || upper === 'UI' || upper === 'INPUT') {
    text = pickString(c.text) || '';
  } else {
    text = pickString(c.text) || pickString(c.transcription) || '';
  }

  text = text.trim();
  if (text.length > MAX_TEXT_LEN) text = text.slice(0, MAX_TEXT_LEN) + '…';

  const frameId =
    c.frame_id != null
      ? Number(c.frame_id)
      : c.frameId != null
        ? Number(c.frameId)
        : null;

  const eventType = inferEventType(upper, c);

  return {
    timestamp,
    app_name: appName,
    window_title: windowTitle,
    url,
    text,
    frame_id: Number.isFinite(frameId) ? frameId : null,
    event_type: eventType,
  };
}

function inferEventType(typeUpper, content) {
  const t = typeUpper || 'UNKNOWN';
  if (t === 'OCR') return 'ocr';
  if (t === 'AUDIO') return 'audio';
  if (t === 'UI') return 'ui';
  if (t === 'INPUT') return 'input';
  if (content?.chunk_id != null) return 'audio';
  if (content?.frame_id != null) return 'ocr';
  return t ? t.toLowerCase() : 'unknown';
}

function pickString(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

function isNoise(ev) {
  if (!ev.text || ev.text.length < MIN_TEXT_LEN) return true;
  if (/^[\s\W]+$/.test(ev.text)) return true;
  return false;
}

function compareTimestamp(a, b) {
  const da = parseTs(a);
  const db = parseTs(b);
  if (da === db) return 0;
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db;
}

function parseTs(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Drop consecutive identical text in same app within a short window (OCR spam). */
function dedupeWeakConsecutive(events) {
  const out = [];
  let prev = null;
  for (const ev of events) {
    if (
      prev &&
      prev.text === ev.text &&
      prev.app_name === ev.app_name &&
      prev.timestamp &&
      ev.timestamp &&
      Math.abs((parseTs(ev.timestamp) || 0) - (parseTs(prev.timestamp) || 0)) < 1500
    ) {
      continue;
    }
    out.push(ev);
    prev = ev;
  }
  return out;
}

module.exports = {
  normalizeEvents,
};
