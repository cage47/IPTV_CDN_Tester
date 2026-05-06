const CF_WORKER_URL = process.env.CF_PROXY_URL || 'https://tv-proxy.ttpcountermeasures.workers.dev';
const CF_PROXY_SECRET = process.env.CF_PROXY_SECRET || '';

export default async function handler(req, res) {
  const targetUrl = req.query.url;
  const method = (req.query.method || 'GET').toUpperCase();

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(CF_WORKER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Secret': CF_PROXY_SECRET,
      },
      body: JSON.stringify({
        url: targetUrl,
        method: method,
        headers: upstreamHeaders,
      }),
    });

    clearTimeout(timeout);

    if (method === 'HEAD') {
      const originalStatus = response.headers.get('x-original-status');
      // If x-original-status is present, the CF Worker reached the upstream — server is alive.
      // Return 200 regardless of what the upstream said (4xx/5xx on root paths is normal for IPTV).
      // Only propagate a non-200 if the CF Worker itself failed to connect (no x-original-status).
      return res.status(originalStatus ? 200 : response.status).end();
    }

    const contentType = response.headers.get('x-original-content-type') ||
                        response.headers.get('content-type') ||
                        'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
      } catch (e) {}
    }
    res.end();
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    return res.status(502).json({ error: e.message || 'Failed to reach upstream' });
  }
}
