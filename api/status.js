import { kv } from '@vercel/kv';

// ─────────────────────────────────────────────
// Public read-only API — serves sanitized status to frontend
// No credentials, no full URLs — just names and health data
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS headers for frontend fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

  const type = req.query.type || 'current';

  try {
    if (type === 'current') {
      const raw = await kv.get('status:current');
      if (!raw) {
        return res.status(200).json({ providers: [], lastChecked: null });
      }

      const results = typeof raw === 'string' ? JSON.parse(raw) : raw;

      // Sanitize — strip credentials and obscure full DNS URLs
      const sanitized = results.map(p => ({
        id: p.id,
        name: p.name,
        checkedAt: p.checkedAt,
        dns: p.dns.map(d => ({
          // Show only the hostname, not the full URL with path/port details
          host: safeHostname(d.url),
          dnsResolves: d.dnsResolves,
          authOk: d.authOk,
          authError: d.authError || null,
          cloudflareBlocked: d.cloudflareBlocked || false,
          channels: d.channels.map(c => ({
            name: c.name,
            status: c.status,
            detail: c.detail,
          })),
        })),
      }));

      return res.status(200).json({
        providers: sanitized,
        lastChecked: results[0]?.checkedAt || null,
      });
    }

    if (type === 'history') {
      const limit = Math.min(parseInt(req.query.limit) || 24, 168);
      const raw = await kv.lrange('status:history', 0, limit - 1);

      if (!raw || raw.length === 0) {
        return res.status(200).json({ history: [] });
      }

      const history = raw.map(entry => {
        const parsed = typeof entry === 'string' ? JSON.parse(entry) : entry;
        return {
          timestamp: parsed.timestamp,
          providers: parsed.providers.map(p => ({
            id: p.id,
            dns: p.dns.map(d => ({
              host: safeHostname(d.url),
              dnsResolves: d.dnsResolves,
              authOk: d.authOk,
              cloudflareBlocked: d.cloudflareBlocked || false,
              online: d.online,
              blocked: d.blocked,
              black: d.black,
              error: d.error,
              total: d.total,
            })),
          })),
        };
      });

      return res.status(200).json({ history });
    }

    return res.status(400).json({ error: 'Invalid type. Use "current" or "history".' });
  } catch (e) {
    console.error('Status read error:', e);
    return res.status(500).json({ error: 'Failed to read status data' });
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}
