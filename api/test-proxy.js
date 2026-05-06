const CF_WORKER_URL = process.env.CF_PROXY_URL || 'https://tv-proxy.ttpcountermeasures.workers.dev';
const CF_PROXY_SECRET = process.env.CF_PROXY_SECRET || '';

async function fetchDirect(targetUrl, method, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(targetUrl, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers,
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function fetchViaWorker(targetUrl, method, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(CF_WORKER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Secret': CF_PROXY_SECRET,
      },
      body: JSON.stringify({ url: targetUrl, method, headers }),
    });
    clearTimeout(timeout);
    return response;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

export default async function handler(req, res) {
  const targetUrl = req.query.url;
  const method = (req.query.method || 'GET').toUpperCase();

  if (!targetUrl) return res.status(400).json({ error: 'Missing url parameter' });
  try { new URL(targetUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  // Build upstream headers — MAC cookie forwarding for Stalker portal requests
  const mac = req.query.mac;
  const upstreamHeaders = {};
  if (mac) {
    upstreamHeaders['Cookie'] = `mac=${mac}`;
    upstreamHeaders['User-Agent'] = 'Mozilla/5.0 (QtEmbedded; U; Linux; C) AppleWebKit/533.3 (KHTML, like Gecko) MAG200 stbapp ver: 2 rev: 241 Safari/533.3';
    upstreamHeaders['X-User-Agent'] = 'Model: MAG250; Link: Ethernet';
  } else {
    upstreamHeaders['User-Agent'] = req.query.ua || 'TiviMate/4.4.0 (Linux; Android 11)';
  }

  let response;
  let viaWorker = false;

  // Try direct first — fall back to CF Worker only if direct throws
  try {
    response = await fetchDirect(targetUrl, method, upstreamHeaders);
  } catch (directErr) {
    try {
      response = await fetchViaWorker(targetUrl, method, upstreamHeaders);
      viaWorker = true;
    } catch (workerErr) {
      if (workerErr.name === 'AbortError') return res.status(504).json({ error: 'Upstream timeout' });
      return res.status(502).json({ error: 'Both direct and proxy failed' });
    }
  }

  // ── HEAD (ping/latency) ──────────────────────────────────────────────
  if (method === 'HEAD') {
    if (viaWorker) {
      // CF Worker returns 200 with x-original-status when upstream responded
      const originalStatus = response.headers.get('x-original-status');
      return res.status(originalStatus ? 200 : response.status).end();
    }
    // Direct: any upstream response means server is alive
    return res.status(200).end();
  }

  // ── GET (throughput) ─────────────────────────────────────────────────
  let contentType;
  if (viaWorker) {
    contentType = response.headers.get('x-original-content-type') ||
                  response.headers.get('content-type') ||
                  'application/octet-stream';

    // Detect Cloudflare 1003 block — small text/plain response with error code
    if (contentType.includes('text/plain')) {
      const text = await response.text();
      if (text.includes('1003')) {
        res.setHeader('X-Proxy-Blocked', 'true');
        return res.status(403).end();
      }
      res.setHeader('Content-Type', contentType);
      return res.end(text);
    }
  } else {
    contentType = response.headers.get('content-type') || 'application/octet-stream';
  }

  res.setHeader('Content-Type', contentType);

  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (e) {
      // Client disconnected or abort — that's fine
    }
  }
  res.end();
}
