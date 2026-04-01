export default async function handler(req, res) {
  const targetUrl = req.query.url;
  const method = (req.query.method || 'GET').toUpperCase();

  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // Basic validation
  try {
    new URL(targetUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const controller = new AbortController();
    // 8 second timeout to stay within Vercel's limits
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(targetUrl, {
      method,
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (method === 'HEAD') {
      // For ping tests — just return status, no body needed
      return res.status(response.status).end();
    }

    // For throughput tests — stream the response body back
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/octet-stream');

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
  } catch (e) {
    if (e.name === 'AbortError') {
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    return res.status(502).json({ error: e.message || 'Failed to reach upstream' });
  }
}
