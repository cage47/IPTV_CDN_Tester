#!/usr/bin/env python3
"""
CDN DNS Performance Tester with Xtream Codes API Integration
Tests multiple CDN endpoints for latency, jitter, throughput, and network characteristics
"""

import sys
import subprocess
import importlib.util
import os

def check_python_version():
    """Check if Python version is 3.7 or higher"""
    if sys.version_info < (3, 7):
        print("❌ ERROR: Python 3.7 or higher is required")
        print(f"   Current version: {sys.version}")
        print("\n📥 Please install Python 3.7+ from https://www.python.org/downloads/")
        input("\nPress Enter to exit...")
        sys.exit(1)
    print(f"✅ Python version: {sys.version.split()[0]}")

def check_and_install_dependencies():
    """Check for required packages and install if missing"""
    required_packages = {
        'aiohttp': 'aiohttp',
    }
    
    print("\n" + "="*80)
    print("CHECKING DEPENDENCIES")
    print("="*80)
    
    missing_packages = []
    
    for import_name, pip_name in required_packages.items():
        spec = importlib.util.find_spec(import_name)
        if spec is None:
            print(f"❌ {pip_name} - NOT INSTALLED")
            missing_packages.append(pip_name)
        else:
            print(f"✅ {pip_name} - installed")
    
    if missing_packages:
        print("\n" + "="*80)
        print("INSTALLING MISSING PACKAGES")
        print("="*80)
        print(f"\n📦 Installing: {', '.join(missing_packages)}\n")
        
        # Try standard install first
        try:
            subprocess.check_call([
                sys.executable, 
                '-m', 
                'pip', 
                'install', 
                '--quiet',
                '--disable-pip-version-check'
            ] + missing_packages)
            
            print("\n✅ All packages installed successfully!")
            
        except subprocess.CalledProcessError:
            # Try with --break-system-packages for Ubuntu/Debian
            print("⚠️  Standard install failed, trying with --break-system-packages...")
            try:
                subprocess.check_call([
                    sys.executable, 
                    '-m', 
                    'pip', 
                    'install',
                    '--break-system-packages',
                    '--quiet',
                    '--disable-pip-version-check'
                ] + missing_packages)
                
                print("\n✅ All packages installed successfully!")
                
            except subprocess.CalledProcessError as e:
                print(f"\n❌ ERROR: Failed to install packages")
                print(f"   {str(e)}")
                print("\n🔧 Try running this command manually:")
                print(f"   pip install {' '.join(missing_packages)} --break-system-packages")
                print("\n   Or use a virtual environment:")
                print("   python3 -m venv venv")
                print("   source venv/bin/activate  # On Windows: venv\\Scripts\\activate")
                print(f"   pip install {' '.join(missing_packages)}")
                input("\nPress Enter to exit...")
                sys.exit(1)
        except Exception as e:
            print(f"\n❌ UNEXPECTED ERROR: {str(e)}")
            print("\n🔧 Try running this command manually:")
            print(f"   pip install {' '.join(missing_packages)}")
            input("\nPress Enter to exit...")
            sys.exit(1)
    else:
        print("\n✅ All required packages are installed!")
    
    print("="*80 + "\n")

# Run checks before importing dependencies
print("="*80)
print("CDN PERFORMANCE TESTER - STARTUP CHECK")
print("="*80)
check_python_version()
check_and_install_dependencies()

# Now import the packages
import asyncio
import aiohttp
import time
import statistics
import socket
import json
import csv
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict, fields
import argparse

@dataclass
class TestResult:
    dns_entry: str
    channel_id: str
    channel_name: str
    timestamp: str
    avg_latency_ms: float
    jitter_ms: float
    throughput_mbps: float
    ip_address: str
    asn: Optional[str]
    geolocation: Optional[str]
    hosting_provider: Optional[str]
    cloudflare_blocked: bool
    success_rate: float
    error_message: Optional[str] = None

class CDNTester:
    USER_AGENTS = {
        'tivimate': 'TiviMate/4.4.0 (Android 11)',
        'vlc': 'VLC/3.0.18 LibVLC/3.0.18'
    }
    
    # Known Cloudflare abuse redirect patterns
    CLOUDFLARE_ABUSE_PATTERNS = [
        'cloudflare-terms-of-service-abuse.com',
        'cloudflare.com/cdn-cgi/trace',
        'cloudflare.com/abuse',
    ]
    
    def __init__(self, username: str, password: str, user_agent: str = 'tivimate'):
        self.username = username
        self.password = password
        self.user_agent = self.USER_AGENTS.get(user_agent.lower(), self.USER_AGENTS['tivimate'])
    
    async def check_cloudflare_block(self, url: str, session: aiohttp.ClientSession) -> bool:
        """Check if Cloudflare is blocking/redirecting the stream"""
        headers = {'User-Agent': self.user_agent}
        
        try:
            async with session.head(url, headers=headers, timeout=10, allow_redirects=False) as resp:
                # Check for 302 redirect
                if resp.status == 302:
                    location = resp.headers.get('Location', '')
                    # Check if redirected to Cloudflare abuse page
                    if any(pattern in location.lower() for pattern in self.CLOUDFLARE_ABUSE_PATTERNS):
                        return True
                
                # Check for Cloudflare server header with suspicious redirects
                server = resp.headers.get('Server', '').lower()
                if 'cloudflare' in server and resp.status in [302, 403, 503]:
                    return True
                    
        except Exception:
            pass
        
        return False
    
    async def get_xtream_categories(self, dns_entry: str, session: aiohttp.ClientSession) -> List[Dict]:
        """Fetch available live stream categories from Xtream API"""
        try:
            api_url = f"{dns_entry}/player_api.php?username={self.username}&password={self.password}&action=get_live_categories"
            
            print(f"\n📋 Fetching categories from Xtream API...")
            async with session.get(api_url, timeout=30) as resp:
                if resp.status != 200:
                    print(f"❌ Failed to fetch categories (HTTP {resp.status})")
                    return []
                
                categories = await resp.json()
                
                if not isinstance(categories, list) or len(categories) == 0:
                    print(f"❌ No categories found")
                    return []
                
                print(f"✅ Found {len(categories)} categories")
                return categories
                
        except Exception as e:
            print(f"❌ Error fetching categories: {e}")
        
        return []
    
    async def get_channels_by_category(self, dns_entry: str, category_id: str, session: aiohttp.ClientSession) -> List[Dict]:
        """Fetch channels in a specific category"""
        try:
            api_url = f"{dns_entry}/player_api.php?username={self.username}&password={self.password}&action=get_live_streams&category_id={category_id}"
            
            async with session.get(api_url, timeout=30) as resp:
                if resp.status != 200:
                    return []
                
                channels = await resp.json()
                
                if isinstance(channels, list):
                    return channels
                
        except Exception as e:
            print(f"❌ Error fetching channels: {e}")
        
        return []
    
    async def verify_xtream_credentials(self, dns_entry: str, session: aiohttp.ClientSession) -> bool:
        """Verify Xtream Codes credentials"""
        try:
            api_url = f"{dns_entry}/player_api.php?username={self.username}&password={self.password}"
            
            async with session.get(api_url, timeout=10) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    if isinstance(data, dict) and 'user_info' in data:
                        status = data['user_info'].get('status', '')
                        if status == 'Active':
                            return True
                        else:
                            print(f"⚠️  Account status: {status}")
                    return True
        except Exception as e:
            print(f"❌ Credential verification failed: {e}")
        
        return False
    
    async def resolve_dns(self, domain: str) -> Optional[str]:
        """Resolve domain to IP address"""
        try:
            loop = asyncio.get_event_loop()
            ip = await loop.getaddrinfo(domain, None)
            return ip[0][4][0]
        except Exception as e:
            print(f"DNS resolution failed for {domain}: {e}")
            return None
    
    async def get_asn_info(self, ip: str, session: aiohttp.ClientSession) -> tuple:
        """Get ASN and geolocation info from IP"""
        try:
            async with session.get(f'https://ipapi.co/{ip}/json/', timeout=5) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    asn = f"AS{data.get('asn', 'Unknown')} - {data.get('org', 'Unknown')}"
                    geo = f"{data.get('city', 'Unknown')}, {data.get('country_name', 'Unknown')}"
                    hosting = self.identify_hosting_provider(data.get('org', ''), data.get('asn', ''))
                    return asn, geo, hosting
        except Exception as e:
            print(f"ASN lookup failed for {ip}: {e}")
        return None, None, None
    
    def identify_hosting_provider(self, org: str, asn: str) -> str:
        """Identify the hosting provider from organization name and ASN"""
        org_lower = org.lower()
        asn_str = str(asn).lower()
        
        # Cloud providers
        if any(x in org_lower for x in ['cloudflare', 'cf-', 'cloud flare']):
            return 'Cloudflare'
        elif any(x in org_lower for x in ['amazon', 'aws', 'amazon.com', 'ec2']):
            return 'Amazon Web Services (AWS)'
        elif any(x in org_lower for x in ['google', 'gcp', 'google cloud']):
            return 'Google Cloud Platform (GCP)'
        elif any(x in org_lower for x in ['microsoft', 'azure', 'msft']):
            return 'Microsoft Azure'
        elif any(x in org_lower for x in ['digitalocean', 'digital ocean']):
            return 'DigitalOcean'
        elif any(x in org_lower for x in ['linode', 'akamai']):
            return 'Linode/Akamai'
        elif any(x in org_lower for x in ['ovh', 'ovhcloud']):
            return 'OVH'
        elif any(x in org_lower for x in ['hetzner']):
            return 'Hetzner'
        elif any(x in org_lower for x in ['vultr']):
            return 'Vultr'
        elif any(x in org_lower for x in ['alibaba', 'aliyun']):
            return 'Alibaba Cloud'
        elif any(x in org_lower for x in ['oracle', 'oraclecloud']):
            return 'Oracle Cloud'
        elif any(x in org_lower for x in ['ibm', 'softlayer']):
            return 'IBM Cloud'
        elif any(x in org_lower for x in ['rackspace']):
            return 'Rackspace'
        elif any(x in org_lower for x in ['contabo']):
            return 'Contabo'
        
        # CDN providers
        elif any(x in org_lower for x in ['fastly']):
            return 'Fastly CDN'
        elif any(x in org_lower for x in ['cdn77']):
            return 'CDN77'
        elif any(x in org_lower for x in ['stackpath', 'highwinds']):
            return 'StackPath'
        elif any(x in org_lower for x in ['bunny', 'bunnycdn']):
            return 'BunnyCDN'
        
        # Known ASNs
        elif asn_str in ['13335', 'as13335']:
            return 'Cloudflare'
        elif asn_str in ['16509', 'as16509', '14618', 'as14618']:
            return 'Amazon Web Services (AWS)'
        elif asn_str in ['15169', 'as15169']:
            return 'Google Cloud Platform (GCP)'
        elif asn_str in ['8075', 'as8075']:
            return 'Microsoft Azure'
        
        # Generic categorization
        elif any(x in org_lower for x in ['hosting', 'host', 'server', 'datacenter', 'data center']):
            return f'Hosting Provider ({org})'
        elif any(x in org_lower for x in ['telecom', 'communications', 'isp', 'internet']):
            return f'ISP/Telecom ({org})'
        
        return org if org else 'Unknown'
    
    async def measure_latency(self, url: str, session: aiohttp.ClientSession, num_pings: int = 5) -> tuple:
        """Measure latency and jitter"""
        latencies = []
        headers = {'User-Agent': self.user_agent}
        
        for _ in range(num_pings):
            try:
                start = time.perf_counter()
                async with session.head(url, headers=headers, timeout=10, allow_redirects=True) as resp:
                    latency = (time.perf_counter() - start) * 1000
                    if resp.status in [200, 302, 401, 403]:
                        latencies.append(latency)
                await asyncio.sleep(0.5)
            except Exception:
                continue
        
        if not latencies:
            return None, None
        
        avg_latency = statistics.mean(latencies)
        jitter = statistics.stdev(latencies) if len(latencies) > 1 else 0
        
        return avg_latency, jitter
    
    async def measure_throughput(self, url: str, session: aiohttp.ClientSession, duration: int = 5) -> Optional[float]:
        """Measure download throughput"""
        headers = {'User-Agent': self.user_agent}
        bytes_downloaded = 0
        
        try:
            start = time.perf_counter()
            async with session.get(url, headers=headers, timeout=duration + 5) as resp:
                if resp.status != 200:
                    return None
                    
                async for chunk in resp.content.iter_chunked(8192):
                    bytes_downloaded += len(chunk)
                    if time.perf_counter() - start > duration:
                        break
            
            elapsed = time.perf_counter() - start
            throughput_mbps = (bytes_downloaded * 8) / (elapsed * 1_000_000)
            return throughput_mbps
            
        except asyncio.TimeoutError:
            if bytes_downloaded > 0:
                throughput_mbps = (bytes_downloaded * 8) / (duration * 1_000_000)
                return throughput_mbps
        except Exception as e:
            print(f"Throughput test failed: {e}")
        
        return None
    
    async def test_single_channel(self, dns_entry: str, channel: Dict, session: aiohttp.ClientSession, 
                                  ip_address: str, asn: str, geo: str, hosting: str) -> TestResult:
        """Test a single channel (used for concurrent testing)"""
        stream_id = channel.get('stream_id')
        channel_name = channel.get('name', 'Unknown')
        
        url = f"{dns_entry}/live/{self.username}/{self.password}/{stream_id}.ts"
        
        # Check for Cloudflare blocking first
        is_blocked = await self.check_cloudflare_block(url, session)
        
        if is_blocked:
            return TestResult(
                dns_entry=dns_entry,
                channel_id=str(stream_id),
                channel_name=channel_name,
                timestamp=datetime.now().isoformat(),
                avg_latency_ms=0,
                jitter_ms=0,
                throughput_mbps=0,
                ip_address=ip_address,
                asn=asn,
                geolocation=geo,
                hosting_provider=hosting,
                cloudflare_blocked=True,
                success_rate=0,
                error_message="Cloudflare ToS violation block detected"
            )
        
        # Measure latency and jitter
        avg_latency, jitter = await self.measure_latency(url, session)
        
        if avg_latency is None:
            return TestResult(
                dns_entry=dns_entry,
                channel_id=str(stream_id),
                channel_name=channel_name,
                timestamp=datetime.now().isoformat(),
                avg_latency_ms=0,
                jitter_ms=0,
                throughput_mbps=0,
                ip_address=ip_address,
                asn=asn,
                geolocation=geo,
                hosting_provider=hosting,
                cloudflare_blocked=False,
                success_rate=0,
                error_message="Connection failed"
            )
        
        # Measure throughput
        throughput = await self.measure_throughput(url, session)
        
        return TestResult(
            dns_entry=dns_entry,
            channel_id=str(stream_id),
            channel_name=channel_name,
            timestamp=datetime.now().isoformat(),
            avg_latency_ms=round(avg_latency, 2),
            jitter_ms=round(jitter, 2),
            throughput_mbps=round(throughput, 2) if throughput else 0,
            ip_address=ip_address,
            asn=asn,
            geolocation=geo,
            hosting_provider=hosting,
            cloudflare_blocked=False,
            success_rate=100.0,
            error_message=None
        )
    
    async def test_endpoint(self, dns_entry: str, channels: List[Dict], session: aiohttp.ClientSession) -> List[TestResult]:
        """Test a single DNS endpoint with selected channels (concurrent)"""
        results = []
        
        # Resolve DNS
        domain = dns_entry.replace('http://', '').replace('https://', '').split('/')[0]
        ip_address = await self.resolve_dns(domain)
        
        if not ip_address:
            for channel in channels:
                results.append(TestResult(
                    dns_entry=dns_entry,
                    channel_id=str(channel.get('stream_id', 'unknown')),
                    channel_name=channel.get('name', 'Unknown'),
                    timestamp=datetime.now().isoformat(),
                    avg_latency_ms=0,
                    jitter_ms=0,
                    throughput_mbps=0,
                    ip_address="N/A",
                    asn=None,
                    geolocation=None,
                    hosting_provider=None,
                    cloudflare_blocked=False,
                    success_rate=0,
                    error_message="DNS resolution failed"
                ))
            return results
        
        # Get ASN and geolocation
        asn, geo, hosting = await self.get_asn_info(ip_address, session)
        
        print(f"\n{'='*80}")
        print(f"Testing {dns_entry} ({ip_address})")
        print(f"Hosting: {hosting or 'Unknown'}")
        print(f"ASN: {asn or 'Unknown'}, Location: {geo or 'Unknown'}")
        print(f"{'='*80}")
        print(f"\n  📺 Testing {len(channels)} channels concurrently...\n")
        
        # Test all channels concurrently
        tasks = []
        for channel in channels:
            task = self.test_single_channel(dns_entry, channel, session, ip_address, asn, geo, hosting)
            tasks.append(task)
        
        # Wait for all tests to complete
        results = await asyncio.gather(*tasks)
        
        # Display results
        for result in results:
            if result.cloudflare_blocked:
                print(f"     🚫 {result.channel_name}: CLOUDFLARE BLOCKED")
            elif result.success_rate > 0:
                print(f"     ✓ {result.channel_name}: Latency: {result.avg_latency_ms}ms | Jitter: {result.jitter_ms}ms | Throughput: {result.throughput_mbps}Mbps")
            else:
                print(f"     ❌ {result.channel_name}: {result.error_message}")
        
        return list(results)
    
    async def run_tests(self, dns_entries: List[str], channels: List[Dict]) -> List[TestResult]:
        """Run tests on all DNS entries"""
        all_results = []
        
        connector = aiohttp.TCPConnector(limit=50, force_close=True)  # Increased limit for concurrent requests
        timeout = aiohttp.ClientTimeout(total=30)
        
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            for dns_entry in dns_entries:
                results = await self.test_endpoint(dns_entry, channels, session)
                all_results.extend(results)
                await asyncio.sleep(1)
        
        return all_results
    
    def generate_report(self, results: List[TestResult]) -> str:
        """Generate a summary report"""
        report = ["\n" + "="*80]
        report.append("CDN PERFORMANCE TEST REPORT")
        report.append("="*80 + "\n")
        
        # Group by DNS entry
        by_dns = {}
        for result in results:
            if result.dns_entry not in by_dns:
                by_dns[result.dns_entry] = []
            by_dns[result.dns_entry].append(result)
        
        # Sort DNS entries by average performance
        dns_scores = {}
        for dns, res_list in by_dns.items():
            # Check if any channels are Cloudflare blocked
            blocked_count = sum(1 for r in res_list if r.cloudflare_blocked)
            successful = [r for r in res_list if r.success_rate > 0 and not r.cloudflare_blocked]
            
            if blocked_count == len(res_list):
                # All blocked - worst score
                dns_scores[dns] = float('inf')
            elif successful:
                avg_latency = statistics.mean([r.avg_latency_ms for r in successful])
                avg_throughput = statistics.mean([r.throughput_mbps for r in successful])
                dns_scores[dns] = avg_latency - (avg_throughput * 10)
            else:
                dns_scores[dns] = float('inf')
        
        sorted_dns = sorted(dns_scores.items(), key=lambda x: x[1])
        
        for rank, (dns, score) in enumerate(sorted_dns, 1):
            res_list = by_dns[dns]
            blocked_count = sum(1 for r in res_list if r.cloudflare_blocked)
            
            report.append(f"#{rank} - {dns}")
            report.append("-" * 80)
            
            if res_list[0].ip_address != "N/A":
                report.append(f"IP Address: {res_list[0].ip_address}")
                report.append(f"Hosting Provider: {res_list[0].hosting_provider or 'Unknown'}")
                report.append(f"ASN: {res_list[0].asn or 'Unknown'}")
                report.append(f"Location: {res_list[0].geolocation or 'Unknown'}")
            
            # Show Cloudflare blocking status
            if blocked_count > 0:
                report.append(f"\n🚫 Cloudflare Blocked: {blocked_count}/{len(res_list)} channels")
            
            successful = [r for r in res_list if r.success_rate > 0 and not r.cloudflare_blocked]
            if successful:
                avg_lat = statistics.mean([r.avg_latency_ms for r in successful])
                avg_jit = statistics.mean([r.jitter_ms for r in successful])
                avg_thr = statistics.mean([r.throughput_mbps for r in successful])
                
                report.append(f"\nAverage Performance:")
                report.append(f"  Latency: {avg_lat:.2f}ms")
                report.append(f"  Jitter: {avg_jit:.2f}ms")
                report.append(f"  Throughput: {avg_thr:.2f}Mbps")
                report.append(f"  Success Rate: {len(successful)}/{len(res_list)} channels")
            else:
                report.append("\n⚠️  All tests failed for this endpoint")
            
            report.append("")
        
        report.append("="*80)
        return "\n".join(report)
    
    def save_to_csv(self, results: List[TestResult], filename: str):
        """Save results to CSV file"""
        if not results:
            print("No results to save")
            return
        
        with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = [field.name for field in fields(TestResult)]
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for result in results:
                writer.writerow(asdict(result))
        
        print(f"\n✅ Results saved to {filename}")

async def interactive_category_selection(dns_entry: str, username: str, password: str) -> List[Dict]:
    """Interactive category and channel selection"""
    connector = aiohttp.TCPConnector(limit=10, force_close=True)
    timeout = aiohttp.ClientTimeout(total=30)
    
    async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
        tester = CDNTester(username, password)
        
        # Verify credentials
        print(f"\n🔑 Verifying credentials for {dns_entry}...")
        if not await tester.verify_xtream_credentials(dns_entry, session):
            print("❌ Invalid credentials or connection failed")
            return []
        
        print("✅ Credentials verified")
        
        # Get categories
        categories = await tester.get_xtream_categories(dns_entry, session)
        
        if not categories:
            return []
        
        # Display categories
        print("\n" + "="*80)
        print("AVAILABLE CATEGORIES")
        print("="*80)
        for idx, cat in enumerate(categories, 1):
            cat_name = cat.get('category_name', 'Unknown')
            print(f"{idx}. {cat_name}")
        
        # Let user select categories
        print("\n📝 Enter category numbers to fetch (separate with spaces, e.g., '1 3 5'):")
        print("   Or press Enter to use all categories")
        selection = input("> ").strip()
        
        selected_categories = []
        if selection:
            try:
                indices = [int(x) - 1 for x in selection.split()]
                selected_categories = [categories[i] for i in indices if 0 <= i < len(categories)]
            except (ValueError, IndexError):
                print("⚠️  Invalid selection, using all categories")
                selected_categories = categories
        else:
            selected_categories = categories
        
        # Fetch channels from selected categories
        all_channels = []
        for cat in selected_categories:
            cat_id = cat.get('category_id')
            cat_name = cat.get('category_name', 'Unknown')
            print(f"\n📡 Fetching channels from '{cat_name}'...")
            
            channels = await tester.get_channels_by_category(dns_entry, cat_id, session)
            if channels:
                print(f"   ✓ Found {len(channels)} channels")
                all_channels.extend(channels)
        
        if not all_channels:
            print("\n❌ No channels found in selected categories")
            return []
        
        # Display channels
        print("\n" + "="*80)
        print(f"FOUND {len(all_channels)} CHANNELS")
        print("="*80)
        for idx, ch in enumerate(all_channels[:50], 1):  # Show first 50
            ch_name = ch.get('name', 'Unknown')
            ch_id = ch.get('stream_id', 'N/A')
            print(f"{idx}. {ch_name} (ID: {ch_id})")
        
        if len(all_channels) > 50:
            print(f"... and {len(all_channels) - 50} more channels")
        
        # Let user select channels
        print("\n📝 Enter channel numbers to test (separate with spaces, max 10):")
        print("   Or press Enter to use first 10 channels")
        selection = input("> ").strip()
        
        selected_channels = []
        if selection:
            try:
                indices = [int(x) - 1 for x in selection.split()]
                selected_channels = [all_channels[i] for i in indices if 0 <= i < len(all_channels)][:10]
            except (ValueError, IndexError):
                print("⚠️  Invalid selection, using first 10 channels")
                selected_channels = all_channels[:10]
        else:
            selected_channels = all_channels[:10]
        
        print(f"\n✅ Selected {len(selected_channels)} channels for testing")
        return selected_channels

def get_multiline_input(prompt: str, example: str = None, max_entries: int = 50) -> List[str]:
    """Get multiline input from user, ending with empty line"""
    print(prompt)
    if example:
        print(f"Example:\n{example}")
    print(f"\nEnter values (one per line, max {max_entries}). Press Enter twice (empty line) when done:")
    
    lines = []
    while True:
        line = input().strip()
        if not line:
            if lines:  # Empty line signals end if we have at least one entry
                break
            else:
                continue  # Ignore empty lines at the start
        
        lines.append(line)
        
        # Check if we've reached the limit
        if len(lines) >= max_entries:
            print(f"\n⚠️  Maximum of {max_entries} entries reached.")
            break
    
    return lines

async def main():
    parser = argparse.ArgumentParser(description='Test CDN DNS entries for streaming performance')
    parser.add_argument('--username', '-u', help='Stream username')
    parser.add_argument('--password', '-p', help='Stream password')
    parser.add_argument('--dns-entries', '-d', nargs='+',
                       help='DNS entries to test')
    parser.add_argument('--user-agent', '-a', choices=['tivimate', 'vlc'], default='tivimate',
                       help='User agent to use (default: tivimate)')
    parser.add_argument('--output', '-o', default='cdn_results.csv',
                       help='Output CSV file (default: cdn_results.csv)')
    
    args = parser.parse_args()
    
    # Store credentials for reuse
    saved_username = args.username
    saved_password = args.password
    
    while True:  # Main loop for testing multiple times
        # Interactive prompts
        print("\n" + "="*80)
        print("CDN PERFORMANCE TESTER with Xtream Codes Integration")
        print("="*80)
        print()
        
        # Get or reuse credentials
        if not saved_username:
            saved_username = input("Enter username: ").strip()
        else:
            print(f"Username: {saved_username}")
            change = input("Change username? (y/n): ").strip().lower()
            if change == 'y':
                saved_username = input("Enter new username: ").strip()
        
        if not saved_password:
            saved_password = input("Enter password: ").strip()
        else:
            print(f"Password: {'*' * len(saved_password)}")
            change = input("Change password? (y/n): ").strip().lower()
            if change == 'y':
                saved_password = input("Enter new password: ").strip()
        
        # Get DNS entries
        if not args.dns_entries:
            print("\n" + "="*80)
            print("DNS ENTRY OPTIONS")
            print("="*80)
            print("1. Enter DNS entries on separate lines (one per line, max 50)")
            print("2. Enter DNS entries on a single line (space-separated, max 50)")
            
            choice = input("\nChoose option (1 or 2, default=1): ").strip()
            
            if choice == '2':
                print("\nEnter DNS entries (separate with spaces, max 50):")
                print("Example: http://cdn1.example.com http://cdn2.example.com")
                dns_input = input("> ").strip()
                dns_entries = dns_input.split()[:50]  # Limit to 50
                if len(dns_input.split()) > 50:
                    print(f"⚠️  Limited to first 50 DNS entries")
            else:
                # Multiline input (default)
                dns_entries = get_multiline_input(
                    "\nEnter DNS entries (one per line):",
                    "http://pro.player-mate3.me/\nhttp://cdn-platine.rest/\nhttp://cdn-platine.store/",
                    max_entries=50
                )
        else:
            dns_entries = args.dns_entries[:50]  # Limit to 50
            if len(args.dns_entries) > 50:
                print(f"⚠️  Limited to first 50 DNS entries")
        
        if not saved_username or not saved_password or not dns_entries:
            print("\n❌ Error: Username, password, and DNS entries are required!")
            retry = input("\nTry again? (y/n): ").strip().lower()
            if retry != 'y':
                return
            continue
        
        # Display DNS entries
        print(f"\n📋 DNS Entries to test ({len(dns_entries)} total):")
        for idx, dns in enumerate(dns_entries, 1):
            print(f"  {idx}. {dns}")
        
        confirm = input("\nProceed with these DNS entries? (y/n): ").strip().lower()
        if confirm != 'y':
            args.dns_entries = None  # Reset to allow re-entry
            continue
        
        # Use first DNS for category/channel selection
        print(f"\n🎯 Using {dns_entries[0]} to fetch categories and channels...")
        selected_channels = await interactive_category_selection(dns_entries[0], saved_username, saved_password)
        
        if not selected_channels:
            print("\n❌ No channels selected.")
            retry = input("\nTry again with different settings? (y/n): ").strip().lower()
            if retry != 'y':
                return
            args.dns_entries = None
            continue
        
        print("\n" + "="*80)
        print(f"Starting CDN Performance Tests...")
        print(f"User Agent: {args.user_agent}")
        print(f"DNS Entries: {len(dns_entries)}")
        print(f"Channels: {len(selected_channels)}")
        print(f"Testing Mode: CONCURRENT (all channels tested simultaneously)")
        print(f"Output File: {args.output}")
        print("="*80)
        
        tester = CDNTester(saved_username, saved_password, args.user_agent)
        results = await tester.run_tests(dns_entries, selected_channels)
        
        if not results:
            print("\n❌ No results collected.")
        else:
            # Generate and print report
            report = tester.generate_report(results)
            print(report)
            
            # Check for Cloudflare blocks
            blocked_dns = set()
            for result in results:
                if result.cloudflare_blocked:
                    blocked_dns.add(result.dns_entry)
            
            if blocked_dns:
                print("\n" + "="*80)
                print("⚠️  CLOUDFLARE BLOCKING DETECTED")
                print("="*80)
                print("\nThe following DNS entries are blocked by Cloudflare:")
                for dns in blocked_dns:
                    print(f"  🚫 {dns}")
                print("\nThese servers redirect to: cloudflare-terms-of-service-abuse.com")
                print("This indicates a Terms of Service violation block.")
                print("="*80)
            
            # Save to CSV
            tester.save_to_csv(results, args.output)
            
            print("\n✅ Testing complete!")
        
        # Ask if user wants to run another test
        print("\n" + "="*80)
        print("WHAT WOULD YOU LIKE TO DO?")
        print("="*80)
        print("1. Run another test (keep credentials, change DNS/channels)")
        print("2. Exit")
        
        choice = input("\nEnter choice (1 or 2): ").strip()
        
        if choice != '1':
            print("\nThank you for using CDN Performance Tester!")
            input("\nPress Enter to exit...")
            break
        
        # Reset DNS entries for next iteration
        args.dns_entries = None

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Testing interrupted by user")
        input("\nPress Enter to exit...")
    except Exception as e:
        print(f"\n\n❌ UNEXPECTED ERROR: {str(e)}")
        print("\n🔧 Please report this error if it persists")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
