import { kv } from '@vercel/kv';

// ─────────────────────────────────────────────
// Cron handler — runs hourly via Vercel Cron
// Reads provider config from env, checks each one, stores results in KV
// ─────────────────────────────────────────────
export default async function handler(req, res) {
  // Verify this is a legitimate cron call (Vercel sets this header)
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Parse provider config from env var
  // Format: JSON array of provider objects
  // [
  //   {
  //     "id": "provider-slug",
  //     "name": "Provider Display Name",
  //     "dns": ["http://dns1.example.com", "http://dns2.example.com"],
  //     "username": "user123",
  //     "password": "pass456",
  //     "channels": [
  //       { "id": "325787", "name": "CNN HD" },
  //       { "id": "412893", "name": "ESPN" }
  //     ]
  //   }
  // ]
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
        channels: [],
      };

      // ── Step 1: DNS resolution + Xtream auth check ──
      try {
        const authUrl = `${dnsUrl.replace(/\/$/, '')}/player_api.php`;
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
        }, 10000);

        dnsResult.dnsResolves = true;

        if (authRes.ok) {
          const data = await authRes.json().catch(() => null);
          if (data && data.user_info) {
            dnsResult.authOk = true;
          } else {
            dnsResult.authError = 'Invalid API response (no user_info)';
          }
        } else {
          // Check if it's a Cloudflare block
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
          dnsResult.authError = 'Timeout (10s)';
        } else if (e.cause && e.cause.code === 'ENOTFOUND') {
          dnsResult.authError = 'DNS resolution failed';
        } else {
          dnsResult.dnsResolves = true; // Could resolve but had other error
          dnsResult.authError = e.message || 'Connection error';
        }
      }

      // ── Step 2: Check .ts streams for each channel ──
      for (const channel of provider.channels) {
        const streamUrl = `${dnsUrl.replace(/\/$/, '')}/live/${provider.username}/${provider.password}/${channel.id}.ts`;
        const chResult = {
          id: channel.id,
          name: channel.name,
          status: 'error',
          detail: '',
        };

        try {
          const streamRes = await fetchWithTimeout(streamUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'TiviMate/4.4.0 (Linux; Android 11)',
            },
          }, 12000);

          const contentType = streamRes.headers.get('content-type') || '';
          const server = streamRes.headers.get('server') || '';
          const cfRay = streamRes.headers.get('cf-ray') || '';

          // Read up to 256KB for analysis
          const chunks = [];
          let totalBytes = 0;
          const maxBytes = 256 * 1024;

          if (streamRes.body) {
            const reader = streamRes.body.getReader();
            try {
              while (totalBytes < maxBytes) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                totalBytes += value.length;
              }
              reader.cancel();
            } catch { /* read error or abort */ }
          }

          // Merge for analysis
          const merged = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }

          // Check for Cloudflare / HTML block
          if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
            const text = new TextDecoder().decode(merged.slice(0, 8192));
            if (isCloudflareBlock(text)) {
              chResult.status = 'blocked';
              chResult.detail = 'Cloudflare ToS violation block';
            } else if (streamRes.status === 403) {
              chResult.status = 'blocked';
              chResult.detail = 'HTTP 403 Forbidden';
            } else {
              chResult.status = 'blocked';
              chResult.detail = `HTML response (HTTP ${streamRes.status})`;
            }
          }
          // HTTP error
          else if (streamRes.status >= 400) {
            chResult.status = 'error';
            chResult.detail = `HTTP ${streamRes.status}`;
          }
          // Check for valid MPEG-TS
          else if (totalBytes > 188 && merged[0] === 0x47) {
            // TS sync byte found — check for black screen
            const sampleStart = 188 * 3;
            const sampleEnd = Math.min(totalBytes, 188 * 50);
            if (sampleEnd > sampleStart) {
              let zeroCount = 0;
              let totalSampled = 0;
              for (let i = sampleStart; i < sampleEnd; i++) {
                const posInPacket = i % 188;
                if (posInPacket < 4) continue;
                totalSampled++;
                if (merged[i] === 0x00 || merged[i] === 0x10) zeroCount++;
              }
              if (totalSampled > 0 && (zeroCount / totalSampled) > 0.90) {
                chResult.status = 'black';
                chResult.detail = 'Black screen (null TS payload)';
              } else {
                chResult.status = 'online';
                chResult.detail = `Valid MPEG-TS (${formatBytes(totalBytes)})`;
              }
            } else {
              chResult.status = 'online';
              chResult.detail = `Valid MPEG-TS (${formatBytes(totalBytes)})`;
            }
          }
          // Check for other valid stream types
          else if (totalBytes > 9 && merged[0] === 0x46 && merged[1] === 0x4C && merged[2] === 0x56) {
            chResult.status = 'online';
            chResult.detail = 'Valid FLV stream';
          }
          else if (contentType.includes('mpegurl') || contentType.includes('x-mpegURL')) {
            chResult.status = 'online';
            chResult.detail = 'HLS playlist (M3U8)';
          }
          else if (totalBytes > 7) {
            const head = new TextDecoder().decode(merged.slice(0, 20));
            if (head.trim().startsWith('#EXTM3U')) {
              chResult.status = 'online';
              chResult.detail = 'HLS playlist (M3U8)';
            } else if (totalBytes > 1000 && streamRes.status === 200) {
              chResult.status = 'online';
              chResult.detail = `Stream data (${formatBytes(totalBytes)})`;
            } else {
              chResult.status = 'error';
              chResult.detail = `Small/unknown response (${totalBytes} bytes)`;
            }
          }
          else if (totalBytes === 0) {
            chResult.status = 'error';
            chResult.detail = 'Empty response';
          }
          else {
            chResult.status = 'error';
            chResult.detail = `Unknown (${contentType || 'no content-type'}, ${totalBytes}B)`;
          }

        } catch (e) {
          if (e.name === 'AbortError') {
            chResult.status = 'error';
            chResult.detail = 'Timeout (12s)';
          } else {
            chResult.status = 'error';
            chResult.detail = e.message || 'Network error';
          }
        }

        dnsResult.channels.push(chResult);
      }

      providerResult.dns.push(dnsResult);
    }

    allResults.push(providerResult);
  }

  // ── Store results in Vercel KV ──
  try {
    // Store current results
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
          online: d.channels.filter(c => c.status === 'online').length,
          blocked: d.channels.filter(c => c.status === 'blocked').length,
          black: d.channels.filter(c => c.status === 'black').length,
          error: d.channels.filter(c => c.status === 'error').length,
          total: d.channels.length,
        })),
      })),
    };

    await kv.lpush('status:history', JSON.stringify(historyEntry));
    await kv.ltrim('status:history', 0, 167); // keep 7 days

  } catch (e) {
    console.error('KV write error:', e);
    return res.status(500).json({ error: 'Failed to store results', detail: e.message });
  }

  return res.status(200).json({
    message: `Checked ${allResults.length} providers at ${new Date(timestamp).toISOString()}`,
    results: allResults.map(p => ({
      id: p.id,
      name: p.name,
      dnsCount: p.dns.length,
      summary: p.dns.map(d => ({
        url: d.url,
        auth: d.authOk,
        online: d.channels.filter(c => c.status === 'online').length,
        total: d.channels.length,
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

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB'];
  let i = 0, val = bytes;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
  return val.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}
