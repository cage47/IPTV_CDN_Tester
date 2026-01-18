# 🚀 CDN Performance Tester

**Test and compare multiple CDN endpoints for optimal IPTV streaming performance**

## 📋 Overview

CDN Performance Tester is a comprehensive tool designed to help you find the best CDN endpoint for your IPTV streaming service. It integrates directly with Xtream Codes API to discover channels and measure real-world performance across multiple CDN servers.

### ✨ Key Features

- 🔍 **Automatic Channel Discovery** - Fetches categories and channels directly from Xtream API
- 📊 **Comprehensive Metrics** - Measures latency, jitter, throughput, and connection reliability
- 🌐 **Network Intelligence** - Identifies hosting providers (Cloudflare, AWS, Azure, etc.)
- 🗺️ **Geolocation** - Shows server locations and ASN information
- 📈 **Performance Ranking** - Automatically ranks CDN endpoints by performance
- 💾 **CSV Export** - Saves detailed results for further analysis
- 🎯 **User-Friendly** - No technical knowledge required, automatic dependency installation

## 🎬 Demo

```
================================================================================
CDN PERFORMANCE TESTER - STARTUP CHECK
================================================================================
✅ Python version: 3.11.5
✅ aiohttp - installed

================================================================================
CDN PERFORMANCE TESTER with Xtream Codes Integration
================================================================================

Enter username: myuser
Enter password: ********

Enter DNS entries (separate each with a space):
> http://cdn1.example.com http://cdn2.example.com

📋 Fetching categories from Xtream API...
✅ Found 25 categories

AVAILABLE CATEGORIES
1. US NEWS HD
2. US SPORTS HD
3. UK CHANNELS
...
```

## 📥 Installation

### Requirements

- **Python 3.7 or higher** - [Download Python](https://www.python.org/downloads/)
- Internet connection

### Quick Start

1. **Download the script:**
   ```bash
   git clone https://github.com/cage47/cdn-performance-tester.git
   cd cdn-performance-tester
   ```

2. **Run the script:**
   ```bash
   python cdn_tester.py
   ```

That's it! The script will automatically install any missing dependencies.

### Alternative: Direct Download

1. Download `cdn_tester.py` from the [latest release](https://github.com/cage47/cdn-performance-tester/releases)
2. Double-click the file or run `python cdn_tester.py`

## 🎯 How to Use

### Interactive Mode (Recommended)

Simply run the script and follow the prompts:

```bash
python cdn_tester.py
```

The script will ask you for:
1. **Username** - Your Xtream Codes username
2. **Password** - Your Xtream Codes password
3. **DNS Entries** - The CDN servers you want to test (space-separated)
4. **Categories** - Which channel categories to test
5. **Channels** - Specific channels to use for testing (up to 10)

### Command Line Mode

For advanced users or automation:

```bash
python cdn_tester.py \
  --username myuser \
  --password mypass \
  --dns-entries http://cdn1.example.com http://cdn2.example.com http://cdn3.example.com \
  --user-agent tivimate \
  --output results.csv
```

### Example

```bash
python cdn_tester.py \
  --username x12334 \
  --password p12345 \
  --dns-entries http://cdn1.me http://cdn2.me http://cdn3.me \
  --user-agent tivimate
```

## 📊 Understanding the Results

### Console Output

The script provides real-time feedback:

```
Testing http://cdn1.example.com (104.21.45.123)
Hosting: Cloudflare
ASN: AS13335 - Cloudflare, Inc., Location: San Francisco, United States

  📺 Testing: CNN HD (ID: 429623)
     ✓ Latency: 45.32ms | Jitter: 2.15ms | Throughput: 125.45Mbps
```

### CSV Export

Results are saved to `cdn_results.csv` with the following columns:

| Column | Description |
|--------|-------------|
| `dns_entry` | CDN server URL |
| `channel_id` | Channel stream ID |
| `channel_name` | Channel name |
| `timestamp` | Test time |
| `avg_latency_ms` | Average ping time (lower is better) |
| `jitter_ms` | Latency variation (lower is better) |
| `throughput_mbps` | Download speed in Mbps (higher is better) |
| `ip_address` | Server IP address |
| `asn` | Autonomous System Number |
| `geolocation` | Server location |
| `hosting_provider` | Identified hosting service |
| `success_rate` | Percentage of successful tests |
| `error_message` | Error details (if any) |

### Performance Report

At the end, you'll get a ranked summary:

```
================================================================================
CDN PERFORMANCE TEST REPORT
================================================================================

#1 - http://cf.its-cdn.me
--------------------------------------------------------------------------------
IP Address: 104.21.45.123
Hosting Provider: Cloudflare
ASN: AS13335 - Cloudflare, Inc.
Location: San Francisco, United States

Average Performance:
  Latency: 42.15ms
  Jitter: 1.85ms
  Throughput: 145.32Mbps
  Success Rate: 10/10 channels

#2 - http://pro.business-cdn.me
...
```

## 🔧 Configuration Options

### Command Line Arguments

| Argument | Short | Description | Default |
|----------|-------|-------------|---------|
| `--username` | `-u` | Xtream username | Interactive prompt |
| `--password` | `-p` | Xtream password | Interactive prompt |
| `--dns-entries` | `-d` | CDN servers to test | Interactive prompt |
| `--user-agent` | `-a` | User agent (`tivimate` or `vlc`) | `tivimate` |
| `--output` | `-o` | CSV output filename | `cdn_results.csv` |

### Supported User Agents

- **tivimate** - TiviMate/4.4.0 (Android 11)
- **vlc** - VLC/3.0.18 LibVLC/3.0.18

## 🏗️ How It Works

1. **Credential Verification** - Validates Xtream Codes credentials
2. **Category Discovery** - Fetches available channel categories via Xtream API
3. **Channel Selection** - Lets you choose specific channels to test
4. **DNS Resolution** - Resolves each CDN domain to IP addresses
5. **ASN Lookup** - Identifies hosting provider and geolocation
6. **Latency Testing** - Measures average ping time and jitter (5 pings per channel)
7. **Throughput Testing** - Downloads stream data for 5 seconds to measure speed
8. **Performance Ranking** - Calculates overall score and ranks CDNs
9. **Report Generation** - Creates detailed CSV and console summary

## 🌐 Supported Hosting Providers

The script automatically identifies these providers:

### Cloud Providers
- Cloudflare
- Amazon Web Services (AWS)
- Google Cloud Platform (GCP)
- Microsoft Azure
- Oracle Cloud
- IBM Cloud
- Alibaba Cloud

### Hosting/VPS Providers
- DigitalOcean
- Linode/Akamai
- OVH
- Hetzner
- Vultr
- Rackspace
- Contabo

### CDN Providers
- Fastly CDN
- CDN77
- StackPath
- BunnyCDN

## ❓ Troubleshooting

### "Python not found"
**Problem:** Windows can't find Python
**Solution:** Install Python from [python.org](https://www.python.org/downloads/) and check "Add Python to PATH" during installation

### "Failed to install packages"
**Problem:** Automatic package installation failed
**Solution:** Run manually: `pip install aiohttp`

### "Invalid credentials"
**Problem:** Can't connect to Xtream API
**Solution:** 
- Verify your username and password are correct
- Ensure the DNS entry is correct (must include `http://` or `https://`)
- Check if your IPTV subscription is active

### "No categories found"
**Problem:** Xtream API returns no data
**Solution:**
- Verify the CDN URL is correct
- Try a different DNS entry from your provider
- Some providers may not support the Xtream API

### All tests show 0 throughput
**Problem:** Can't download stream data
**Solution:**
- Check your internet connection
- The stream may require authentication that's failing
- Try different channels

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

```bash
git clone https://github.com/cage47/cdn-performance-tester.git
cd cdn-performance-tester
pip install aiohttp
```

### Reporting Issues

Please include:
- Python version (`python --version`)
- Operating system
- Complete error message
- Steps to reproduce

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is intended for testing your own legal IPTV subscriptions. It does not provide any content, channels, or streams. The developers are not responsible for how this tool is used. Please ensure you have the right to test the services you're connecting to.

## 🙏 Acknowledgments

- Inspired by [xtream2m3u](https://github.com/ovosimpatico/xtream2m3u) for Xtream API integration
- Uses [ipapi.co](https://ipapi.co) for IP geolocation services
- Built with [aiohttp](https://docs.aiohttp.org/) for async HTTP requests


**Made with ❤️ for the IPTV community**
