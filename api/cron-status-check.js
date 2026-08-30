import { kv } from '@vercel/kv';

// ─────────────────────────────────────────────
// Cron handler — runs hourly via Vercel Cron
// Auth-only check: hits player_api.php for each provider endpoint,
// records DNS resolution, auth validity, response time, and account info.
// Stream availability is not tested.
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Format: JSON array — see README for schema
  let providers;
  try {
    providers = JSON.parse(process.env.PROVIDER_CONFIG || '[]');
  } catch (e) {
    return res.status(500).json({ error: 'Invalid PROVIDER_CONFIG env var' });
  }

  if (providers.length === 0) {
    return res.status(200).json({ message: 'No providers configured' });
  }

  const timestamp = Date.now();
  const allResults = [];

  for (const provider of providers) {
    const providerResult = {
      id: provider.id,
      name: provider.name,
      checkedAt: timestamp,
      dns: [],
    };

    for (const dnsUrl of provider.dns) {
      const dnsResult = {
        url: dnsUrl,
        dnsResolves: false,
        authOk: false,
        responseMs: null,
        account: null,
      };

      try {
        const authUrl = `${dnsUrl.replace(/\/$/, '')}/player_api.php`;
        const start = Date.now();

        const authRes = await fetchWithTimeout(authUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TiviMate/4.4.0 (Linux; Android 11)',
          },
          body: new URLSearchParams({
            username: provider.username,
            password: provider.password,
          }).toString(),
        }, 12000);

        dnsResult.responseMs = Date.now() - start;
        dnsResult.dnsResolves = true;

        if (authRes.ok) {
          const data = await authRes.json().catch(() => null);
          if (data && data.user_info) {
            dnsResult.authOk = true;
            dnsResult.account = {
              status: data.user_info.status || null,
              maxConnections: data.user_info.max_connections != null
                ? parseInt(data.user_info.max_connections, 10)
                : null,
              formats: Array.isArray(data.user_info.allowed_output_formats)
                ? data.user_info.allowed_output_formats
                : [],
              expDate: data.user_info.exp_date || null,
            };
          } else {
            dnsResult.authError = 'Invalid API response (no user_info)';
          }
        } else {
          const contentType = authRes.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            const body = await authRes.text().catch(() => '');
            if (isCloudflareBlock(body)) {
              dnsResult.authError = `Cloudflare block (HTTP ${authRes.status})`;
              dnsResult.cloudflareBlocked = true;
            } else {
              dnsResult.authError = `HTTP ${authRes.status} (HTML response)`;
            }
          } else {
            dnsResult.authError = `HTTP ${authRes.status}`;
          }
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          dnsResult.authError = 'Timeout (12s)';
        } else if (e.cause && e.cause.code === 'ENOTFOUND') {
          dnsResult.authError = 'DNS resolution failed';
        } else {
          dnsResult.dnsResolves = true;
          dnsResult.authError = e.message || 'Connection error';
        }
      }

      providerResult.dns.push(dnsResult);
    }

    allResults.push(providerResult);
  }

  // ── Store results in Vercel KV ──
  try {
    await kv.set('status:current', JSON.stringify(allResults));

    // Append to history (keep last 168 entries = 7 days at 1/hr)
    const historyEntry = {
      timestamp,
      providers: allResults.map(p => ({
        id: p.id,
        dns: p.dns.map(d => ({
          url: d.url,
          dnsResolves: d.dnsResolves,
          authOk: d.authOk,
          cloudflareBlocked: d.cloudflareBlocked || false,
          responseMs: d.responseMs,
        })),
      })),
    };

    await kv.lpush('status:history', JSON.stringify(historyEntry));
    await kv.ltrim('status:history', 0, 167);
  } catch (e) {
    console.error('KV write error:', e);
    return res.status(500).json({ error: 'Failed to store results', detail: e.message });
  }

  return res.status(200).json({
    message: `Checked ${allResults.length} providers at ${new Date(timestamp).toISOString()}`,
    results: allResults.map(p => ({
      id: p.id,
      name: p.name,
      dns: p.dns.map(d => ({
        dnsResolves: d.dnsResolves,
        authOk: d.authOk,
        responseMs: d.responseMs,
        authError: d.authError || null,
      })),
    })),
  });
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isCloudflareBlock(html) {
  const lower = html.toLowerCase();
  const signals = [
    'cf-error-details', 'error 1000', 'error 1001', 'error 1002',
    'error 1003', 'error 1006', 'error 1010', 'error 1012',
    'error 1015', 'error 1020', 'error 1048',
    'sorry, you have been blocked', 'attention required',
    'why have i been blocked', 'checking your browser',
    'please stand by', 'just a moment', 'cf-browser-verification',
    'ray id:', 'cloudflare ray id',
  ];
  return signals.some(sig => lower.includes(sig));
}
