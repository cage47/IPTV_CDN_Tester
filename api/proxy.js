export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { serverUrl, params } = req.body;

  // Validate URL
  let parsed;
  try {
    parsed = new URL(serverUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Bad protocol');
  } catch {
    return res.status(400).json({ error: 'Invalid server URL' });
  }

  // Block private/internal IPs (SSRF protection)
  const hostname = parsed.hostname;
  const privateRanges = [
    /^127\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^localhost$/i,
    /^0\.0\.0\.0$/
  ];
  if (privateRanges.some(r => r.test(hostname))) {
    return res.status(403).json({ error: 'Private addresses not allowed' });
  }

  const target = `${parsed.protocol}//${parsed.host}/player_api.php`;

  try {
    const upstream = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'IPTV-CDN-Tester/1.0',
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(10000),
    });

    const text = await upstream.text();
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.status(upstream.status).send(text);
  } catch (err) {
    res.status(502).json({ error: `Upstream error: ${err.message}` });
  }
}
