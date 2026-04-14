#!/usr/bin/env node
/**
 * Mock Screenpipe server for testing the integration.
 * Mimics the real Screenpipe REST API on port 3030 (or --port N).
 *
 * Endpoints:
 *   GET /health          → health status
 *   GET /search          → sample OCR + audio search results
 *   GET /frames/:id      → synthetic JPEG frame (1x1 pixel)
 *   GET /frames/:id/context → frame context/OCR metadata
 */

'use strict';

const http = require('http');
const url = require('url');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i !== -1 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 3030;
})();

// Minimal valid JPEG (1x1 red pixel)
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS' +
  'Ew8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJ' +
  'CQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/' +
  'EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAA' +
  'AAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=',
  'base64'
);

// Sample data that mimics real Screenpipe responses
const MOCK_FRAMES = {
  1001: {
    text: 'Welcome to the OpenClaw dashboard',
    app: 'Chrome',
    window: 'OpenClaw - Dashboard',
    timestamp: null, // filled at request time
  },
  1002: {
    text: 'terminal: npm run pipeline -- video.mp4',
    app: 'Windows Terminal',
    window: 'bash - openclaw-video-skill-pipeline',
    timestamp: null,
  },
  1003: {
    text: 'File > Save As > skill-output.md',
    app: 'VS Code',
    window: 'accurate-pipeline.js - openclaw-video-skill-pipeline',
    timestamp: null,
  },
};

function now() {
  return new Date().toISOString();
}

function buildSearchResults(query) {
  const ts = now();
  const data = Object.entries(MOCK_FRAMES).map(([id, frame]) => ({
    type: 'OCR',
    content: {
      frame_id: Number(id),
      text: frame.text,
      app_name: frame.app,
      window_name: frame.window,
      timestamp: ts,
    },
  }));

  // Add a sample audio item
  data.push({
    type: 'Audio',
    content: {
      chunk_id: 5001,
      transcription: 'Okay, let me open the pipeline and process the video now.',
      timestamp: ts,
      device_name: 'default',
      duration_secs: 4.2,
    },
  });

  return {
    data,
    pagination: {
      limit: query.limit ? Number(query.limit) : 40,
      offset: query.offset ? Number(query.offset) : 0,
      total: data.length,
    },
  };
}

function handleRequest(req, res) {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // GET /health
  if (pathname === '/health') {
    return json(res, {
      status: 'healthy',
      last_frame_timestamp: now(),
      frame_status: 'ok',
      audio_status: 'ok',
      ui_status: 'ok',
      message: '[mock] Screenpipe mock server is running',
    });
  }

  // GET /search
  if (pathname === '/search') {
    return json(res, buildSearchResults(parsed.query));
  }

  // GET /frames/:id
  const frameMatch = pathname.match(/^\/frames\/(\d+)$/);
  if (frameMatch) {
    const id = Number(frameMatch[1]);
    if (!MOCK_FRAMES[id]) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Frame ${id} not found` }));
    }
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': TINY_JPEG.length,
    });
    return res.end(TINY_JPEG);
  }

  // GET /frames/:id/context
  const ctxMatch = pathname.match(/^\/frames\/(\d+)\/context$/);
  if (ctxMatch) {
    const id = Number(ctxMatch[1]);
    const frame = MOCK_FRAMES[id];
    if (!frame) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Frame ${id} not found` }));
    }
    return json(res, {
      frame_id: id,
      timestamp: now(),
      app_name: frame.app,
      window_name: frame.window,
      ocr_text: frame.text,
      focused: true,
      browser_url: frame.app === 'Chrome' ? 'https://openclaw.example.com/dashboard' : null,
    });
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', path: pathname }));
}

function json(res, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`[mock-screenpipe] listening on http://127.0.0.1:${PORT}`);
  console.log(`[mock-screenpipe] Ctrl+C to stop`);
});
