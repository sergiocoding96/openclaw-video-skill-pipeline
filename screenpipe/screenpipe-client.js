#!/usr/bin/env node
/**
 * Minimal HTTP client for the local Screenpipe REST API.
 * @see https://github.com/screenpipe/screenpipe
 */

'use strict';

function normalizeBaseUrl(url) {
  const s = (url || '').trim();
  if (!s) return 'http://localhost:3030';
  return s.replace(/\/+$/, '');
}

class ScreenpipeApiError extends Error {
  constructor(message, { status, url, bodySnippet } = {}) {
    super(message);
    this.name = 'ScreenpipeApiError';
    this.status = status;
    this.url = url;
    this.bodySnippet = bodySnippet;
  }
}

function createScreenpipeClient(options = {}) {
  const baseUrl = normalizeBaseUrl(
    options.baseUrl != null ? options.baseUrl : process.env.SCREENPIPE_URL
  );

  function joinPath(p) {
    const pathPart = p.startsWith('/') ? p : `/${p}`;
    return `${baseUrl}${pathPart}`;
  }

  async function safeFetch(url, init) {
    try {
      return await fetch(url, init);
    } catch (e) {
      const reason = e && e.cause ? `${e.message} (${e.cause.message || e.cause})` : e.message;
      throw new ScreenpipeApiError(
        `Network error — is Screenpipe running at ${baseUrl}? ${reason}`,
        { status: undefined, url, bodySnippet: reason }
      );
    }
  }

  async function parseJsonResponse(res, url) {
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { _parseError: true, _raw: text.slice(0, 2000) };
      }
    }
    if (!res.ok) {
      const snippet =
        typeof body === 'object' && body && body.error
          ? String(body.error)
          : text.slice(0, 400);
      throw new ScreenpipeApiError(
        `Screenpipe request failed: ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
        { status: res.status, url, bodySnippet: snippet }
      );
    }
    return body;
  }

  /**
   * GET /health
   * @returns {Promise<object>}
   */
  async function health() {
    const url = joinPath('/health');
    const res = await safeFetch(url, {
      headers: { Accept: 'application/json' },
    });
    return parseJsonResponse(res, url);
  }

  /**
   * GET /search — query params match Screenpipe (e.g. start_time, end_time, limit, content_type, q).
   * @param {Record<string, string | number | boolean | undefined | null>} params
   * @returns {Promise<object>}
   */
  async function search(params = {}) {
    const u = new URL(joinPath('/search'));
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      u.searchParams.set(key, String(value));
    }
    const url = u.toString();
    const res = await safeFetch(url, {
      headers: { Accept: 'application/json' },
    });
    return parseJsonResponse(res, url);
  }

  /**
   * GET /frames/{id} — returns raw frame bytes (typically image/jpeg).
   * @param {string|number} id
   * @returns {Promise<{ id: string|number, contentType: string, data: Buffer, byteLength: number }>}
   */
  async function getFrame(id) {
    const url = joinPath(`/frames/${encodeURIComponent(String(id))}`);
    const res = await safeFetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    if (!res.ok) {
      const snippet = buf.toString('utf8').slice(0, 400);
      throw new ScreenpipeApiError(
        `getFrame(${id}): ${res.status} ${res.statusText}${snippet ? ` — ${snippet}` : ''}`,
        { status: res.status, url, bodySnippet: snippet }
      );
    }
    return {
      id,
      contentType,
      data: buf,
      byteLength: buf.length,
    };
  }

  /**
   * GET /frames/{id}/context — JSON context for a frame (when supported by your Screenpipe build).
   * @param {string|number} id
   * @returns {Promise<object>}
   */
  async function getFrameContext(id) {
    const url = joinPath(`/frames/${encodeURIComponent(String(id))}/context`);
    const res = await safeFetch(url, {
      headers: { Accept: 'application/json' },
    });
    return parseJsonResponse(res, url);
  }

  return {
    baseUrl,
    health,
    search,
    getFrame,
    getFrameContext,
  };
}

module.exports = {
  createScreenpipeClient,
  ScreenpipeApiError,
  normalizeBaseUrl,
};
