# 🚀 CDN Performance Tester & Credential Checker

**Test and compare multiple CDN endpoints for optimal IPTV streaming performance, and validate your IPTV credentials instantly.**

## 🌐 Web App — Try It Now

**No installation required.** Use the hosted web version directly in your browser:

### 👉 [iptv-cdn-tester.vercel.app](https://iptv-cdn-tester-cage47s-projects.vercel.app/)

The web app provides the same core functionality as the Python CLI — connect with your Xtream credentials, select channels, and test CDN endpoints — all from your browser with a visual interface and ranked results. The new Credential Checker lets you validate Xtream and Stalker (MAC) accounts in seconds.

> **Concerned about credentials?** See the [Security & Privacy](#-security--privacy) section below. The app is fully open source, has no database, and you can verify every network request in your browser's DevTools — or self-host it yourself.

---

## 📋 Overview

This project provides two tools for the IPTV community:

**CDN Performance Tester** — Finds the best CDN endpoint for your IPTV service. It integrates directly with the Xtream Codes API to discover channels and measure real-world performance across multiple CDN servers.

**Credential Checker** — Validates Xtream (username/password) and Stalker (MAC address) credentials. See account status, expiry dates, max connections, and browse available content categories at a glance.

### Three Ways to Use It

| | CDN Tester (Web) | Credential Checker (Web) | Python CLI |
|---|---|---|---|
| **Install** | None — runs in your browser | None — runs in your browser | Python 3.7+ required |
| **Link** | [CDN Tester](https://iptv-cdn-tester-cage47s-projects.vercel.app/cdn-tester/) | [Credential Checker](https://iptv-cdn-tester-cage47s-projects.vercel.app/credential-checker/) | `python cdn_iptv_tester.py` |
| **Protocols** | Xtream | Xtream + Stalker (MAC) | Xtream |
| **Best for** | Finding fastest CDN, comparing endpoints | Quick account validation | Power users, automation, scripting |
| **Tests from** | Vercel server (proxy) | Vercel server (proxy) | Your local machine |
| **Export** | CSV download | — | CSV file |

### ✨ Key Features

- 🔍 **Automatic Channel Discovery** — Fetches categories and channels directly from Xtream API
- 📊 **Comprehensive Metrics** — Measures latency, jitter, throughput, and connection reliability
- 🌐 **Network Intelligence** — Identifies hosting providers (Cloudflare, AWS, Azure, etc.)
- 🗺️ **Geolocation** — Shows server locations and ASN information
- 📈 **Performance Ranking** — Automatically ranks CDN endpoints by performance
- 💾 **CSV Export** — Saves detailed results for further analysis
- 🔐 **Credential Validation** — Check Xtream and Stalker (MAC) accounts instantly
- 📺 **Category Browsing** — View Live TV, VOD, and Series catalogs with counts

---

## 🔒 Security & Privacy

These tools require your IPTV credentials to function. Here's exactly how they're handled:

### No Database, No Storage

The web app has **no database** — no MongoDB, PostgreSQL, SQLite, or any other data store. Your credentials exist only in your browser's memory for the duration of your session. When you close the tab, they're gone.

### Why the Proxy Exists

IPTV servers reject direct browser requests due to a browser security policy called CORS (Cross-Origin Resource Sharing). The proxy (`api/proxy.js`) is a standard workaround — it forwards your request to the IPTV server and pipes the response back. It does not extract, log, or store any part of your credentials or the response data.

A second proxy (`api/test-proxy.js`) handles the CDN performance tests and credential checks. This exists because Vercel serves the app over HTTPS, but most IPTV endpoints use HTTP — browsers block these "mixed content" requests, so the proxy bridges the gap.

### What the Proxy Logs

Nothing sensitive. The only logging is standard HTTP access logs (method, path, status code, response time) — the same metadata any web server produces. **No request bodies, no credentials, no usernames, no passwords.**

### Verify It Yourself

- **Inspect the code** — Every file in this repo is exactly what runs on Vercel. Read `api/proxy.js` and `api/test-proxy.js` yourself — they're short and straightforward.
- **Watch the network** — Open your browser's DevTools (`F12` → Network tab) while using the app. You'll see requests go only to your IPTV server (via `/api/proxy`) and CDN endpoints (via `/api/test-proxy`).
- **Self-host it** — If you don't trust the hosted version, clone this repo and deploy it yourself (see [Self-Hosting](#self-hosting) below).

### Project Structure (Web App)

```
├── index.html                  ← Landing page / tool hub
├── cdn-tester/
│   └── index.html              ← CDN Performance Tester
├── credential-checker/
│   └── index.html              ← Credential Checker (Xtream + Stalker)
├── api/
│   ├── proxy.js                ← CORS proxy for Xtream API calls
│   └── test-proxy.js           ← Proxy for CDN tests & credential checks
├── vercel.json                 ← Vercel routing config
└── package.json                ← Module type declaration
```

---

## 🌐 CDN Tester — Web App Usage

1. Go to [iptv-cdn-tester.vercel.app/cdn-tester](https://iptv-cdn-tester.vercel.app/cdn-tester/)
2. Enter your Xtream Codes server URL, username, and password
3. Enter 2–10 CDN endpoints to compare (one per line, include `http://` or `https://`)
4. Click **Connect & Fetch Channels**
5. Select up to 10 channels as test probes
6. Click **Run Tests** and wait for results
7. Results are ranked by a weighted score (latency 50%, success rate 30%, throughput 20%)
8. Export to CSV if needed

### A Note on Latency Numbers

Because the web app routes tests through Vercel's proxy server, latency values include the proxy round-trip overhead. This means absolute numbers will be higher than testing locally. However, since **all CDNs are tested through the same proxy**, the relative ranking between them remains accurate — which is what matters for choosing the best endpoint.

For precise absolute measurements, use the Python CLI tool which tests directly from your machine.

---

## 🔐 Credential Checker — Web App Usage

1. Go to [iptv-cdn-tester.vercel.app/credential-checker](https://iptv-cdn-tester-cage47s-projects.vercel.app/credential-checker/)
2. Choose the **Xtream / Single** or **Stalker (MAC)** tab

**For Xtream credentials:**
1. Enter the server URL with port (e.g. `http://example.com:8080`)
2. Enter your username and password
3. Click **Check**
4. View account status, expiry date, max/active connections, server info, and available categories (Live TV, VOD, Series) with counts

**For Stalker (MAC) credentials:**
1. Enter the portal URL (e.g. `http://example.com/stalker_portal/c`)
2. Enter the MAC address (format: `00:1A:79:XX:XX:XX`)
3. Click **Check**
4. View connection status, token, and portal details

---

## 📊 Understanding CDN Results

### Performance Metrics

| Metric | What it measures | Good values |
|---|---|---|
| **Latency** | Round-trip time to the CDN | Lower is better (< 80ms) |
| **Jitter** | Variation in latency | Lower is better (< 10ms) |
| **Throughput** | Download speed from CDN | Higher is better (> 10 Mbps) |
| **Success Rate** | How many channels responded | Higher is better |
| **Score** | Weighted composite | Higher is better |

### CSV Export Columns

| Column | Description |
|---|---|
| `dns_entry` | CDN server URL |
| `channel_id` | Channel stream ID |
| `channel_name` | Channel name |
| `timestamp` | Test time |
| `avg_latency_ms` | Average ping time |
| `jitter_ms` | Latency variation |
| `throughput_mbps` | Download speed in Mbps |
| `ip_address` | Server IP address |
| `asn` | Autonomous System Number |
| `geolocation` | Server location |
| `hosting_provider` | Identified hosting service |
| `success_rate` | Percentage of successful tests |
| `error_message` | Error details (if any) |

---

## 🏗️ How It Works

### CDN Tester

1. **Credential Verification** — Validates Xtream Codes credentials
2. **Category Discovery** — Fetches available channel categories via Xtream API
3. **Channel Selection** — Lets you choose specific channels to test
4. **DNS Resolution** — Resolves each CDN domain to IP addresses
5. **ASN Lookup** — Identifies hosting provider and geolocation
6. **Latency Testing** — Measures average ping time and jitter (5 pings per channel)
7. **Throughput Testing** — Downloads stream data to measure speed
8. **Performance Ranking** — Calculates overall score and ranks CDNs
9. **Report Generation** — Creates detailed CSV and visual summary

### Credential Checker

1. **SSRF Protection** — Validates URLs and blocks private/internal addresses
2. **API Request** — Connects to the Xtream `player_api.php` or Stalker `load.php` endpoint
3. **Account Parsing** — Extracts status, expiry, connection limits, and server info
4. **Category Fetch** — Retrieves Live, VOD, and Series category lists with counts

---

## 🎉 Latest Release (CLI) - v2.1.0

**What's New:**

- 🔥 **10x Faster Testing** — Concurrent channel testing
- 🚫 **Cloudflare Detection** — Identifies ToS violation blocks
- 📝 **Multiline DNS Entry** — Up to 50 DNS entries
- 🔄 **Loop Mode** — Keep credentials between tests

---

## 💻 Python CLI

### Requirements

- **Python 3.7 or higher** — [Download Python](https://www.python.org/downloads/)
- Internet connection

### Quick Start

```bash
git clone https://github.com/cage47/IPTV_CDN_Tester.git
cd IPTV_CDN_Tester
python cdn_iptv_tester.py
```

The script will automatically install any missing dependencies.

### Interactive Mode (Recommended)

Simply run the script and follow the prompts:

```bash
python cdn_iptv_tester.py
```

The script will ask for your username, password, DNS entries, categories, and channels.

### Command Line Mode

```bash
python cdn_iptv_tester.py \
  --username myuser \
  --password mypass \
  --dns-entries http://cdn1.example.com http://cdn2.example.com http://cdn3.example.com \
  --user-agent tivimate \
  --output results.csv
```

### Command Line Arguments

| Argument | Short | Description | Default |
|---|---|---|---|
| `--username` | `-u` | Xtream username | Interactive prompt |
| `--password` | `-p` | Xtream password | Interactive prompt |
| `--dns-entries` | `-d` | CDN servers to test | Interactive prompt |
| `--user-agent` | `-a` | User agent (`tivimate` or `vlc`) | `tivimate` |
| `--output` | `-o` | CSV output filename | `cdn_results.csv` |

---

## 🖥️ Self-Hosting

If you'd prefer to run the web app yourself rather than use the hosted version:

### Option A — Vercel (Recommended)

1. Fork this repository
2. Create a free account at [vercel.com](https://vercel.com)
3. Import your forked repo — Vercel auto-detects the config
4. Done — you'll get your own URL

### Option B — Local Development

```bash
git clone https://github.com/cage47/IPTV_CDN_Tester.git
cd IPTV_CDN_Tester
npm install -g vercel
vercel dev
```

This runs the app locally at `http://localhost:3000` with the serverless functions working.

---

## 🌐 Supported Hosting Providers

The tool automatically identifies these providers:

**Cloud:** Cloudflare, AWS, Google Cloud, Microsoft Azure, Oracle Cloud, IBM Cloud, Alibaba Cloud

**Hosting/VPS:** DigitalOcean, Linode/Akamai, OVH, Hetzner, Vultr, Rackspace, Contabo

**CDN:** Fastly, CDN77, StackPath, BunnyCDN

---

## ❓ Troubleshooting

### CDN Tester (Web)

| Problem | Solution |
|---|---|
| All tests show "unreachable" | Make sure CDN URLs include `http://` or `https://` |
| "No categories returned" | Verify your credentials and server URL are correct |
| Tests are slow | Each CDN × channel combination runs 5 latency pings + a throughput test — this is normal |

### Credential Checker (Web)

| Problem | Solution |
|---|---|
| "Invalid credentials or API response" | Double-check URL format — include the port (e.g. `http://example.com:8080`) |
| "Invalid MAC or portal response" | Verify MAC format (`00:1A:79:XX:XX:XX`) and that the portal URL is correct |
| Stalker check hangs | Some portals require specific user agents — the tool sends standard MAG250 headers |

### Python CLI

| Problem | Solution |
|---|---|
| "Python not found" | Install from [python.org](https://www.python.org/downloads/) — check "Add Python to PATH" on Windows |
| "Failed to install packages" | Run manually: `pip install aiohttp` |
| "Invalid credentials" | Verify username/password and that the DNS entry includes `http://` |
| All tests show 0 throughput | Check your internet connection or try different channels |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

When reporting issues, please include:

- Which tool (CDN Tester, Credential Checker, or CLI)
- Browser or Python version
- Operating system
- Complete error message
- Steps to reproduce

---

## 📜 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is intended for testing your own legal IPTV subscriptions. It does not provide any content, channels, or streams. The developers are not responsible for how this tool is used. Please ensure you have the right to test the services you're connecting to.

## 🙏 Acknowledgments

- Inspired by [xtream2m3u](https://github.com/ovosimpatico/xtream2m3u) for Xtream API integration
- Uses [ipapi.co](https://ipapi.co) for IP geolocation services
- Built with [aiohttp](https://docs.aiohttp.org/) for async HTTP requests (CLI)
- Hosted on [Vercel](https://vercel.com) (web app)

---

**Made with ❤️ for the IPTV community**
