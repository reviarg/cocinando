"""
extract_server.py – simple HTTP API for extracting recipe information from a URL.

This script exposes a single POST endpoint at `/extract`. The request body
should be JSON containing a `url` field. The response will include the
scraped title, ingredients, steps and any links found in the page. This
service is intended to be run on Render or locally. It binds to the port
specified in the `PORT` environment variable or defaults to 8000.
"""

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


def _normalize_space(text):
    return ' '.join((text or '').split())


def _unique_preserve_order(items):
    seen = set()
    unique = []
    for item in items:
        norm = _normalize_space(item).lower()
        if not norm or norm in seen:
            continue
        seen.add(norm)
        unique.append(_normalize_space(item))
    return unique


class RecipeRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        # Allow CORS for all origins since the frontend may be served elsewhere
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        # Support preflight requests for CORS
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.end_headers()

    def do_GET(self):
        # Provide a simple endpoint to show service is running
        self._set_headers(200, 'text/plain')
        self.wfile.write(b'Cocinando extractor running')

    def do_POST(self):
        if self.path != '/extract':
            self._set_headers(404, 'text/plain')
            self.wfile.write(b'Not found')
            return
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        try:
            data = json.loads(body)
            url = data.get('url')
            if not url:
                raise ValueError('Missing URL')
        except Exception:
            self._set_headers(400, 'application/json')
            self.wfile.write(json.dumps({'error': 'Invalid request body'}).encode('utf-8'))
            return
        try:
            # Fetch the page
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117 Safari/537.36'
            }
            resp = requests.get(url, headers=headers, timeout=10)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, 'html.parser')
            result = {}
            # Attempt to parse structured recipe metadata (JSON‑LD)
            try:
                for script in soup.find_all('script', type=lambda t: t and 'ld+json' in t):
                    try:
                        data = json.loads(script.string or '')
                    except Exception:
                        continue
                    # JSON‑LD can be a list or a dict
                    entries = data if isinstance(data, list) else [data]
                    for entry in entries:
                        if isinstance(entry, dict) and entry.get('@type') == 'Recipe':
                            # Title
                            if not result.get('title') and entry.get('name'):
                                result['title'] = entry['name']
                            # Ingredients from structured data
                            if entry.get('recipeIngredient'):
                                result['ingredients'] = _unique_preserve_order(
                                    [i.strip() for i in entry['recipeIngredient'] if i.strip()]
                                )
                            # Instructions from structured data
                            if entry.get('recipeInstructions'):
                                inst = entry['recipeInstructions']
                                steps = []
                                if isinstance(inst, list):
                                    for step in inst:
                                        if isinstance(step, dict) and step.get('text'):
                                            steps.append(step['text'].strip())
                                        elif isinstance(step, str):
                                            steps.append(step.strip())
                                elif isinstance(inst, str):
                                    # Sometimes instructions are provided as a single string with line breaks
                                    steps = [s.strip() for s in inst.split('\n') if s.strip()]
                                if steps:
                                    result['steps'] = _unique_preserve_order(steps)
                            # Image from structured data
                            if not result.get('image') and entry.get('image'):
                                img = entry['image']
                                if isinstance(img, dict) and img.get('url'):
                                    result['image'] = img['url']
                                elif isinstance(img, list) and img:
                                    first = img[0]
                                    if isinstance(first, str):
                                        result['image'] = first
                                    elif isinstance(first, dict) and first.get('url'):
                                        result['image'] = first['url']
                                elif isinstance(img, str):
                                    result['image'] = img
                            # Break after first recipe entry
                            break
                    if result.get('ingredients') or result.get('steps'):
                        break
            except Exception:
                pass
            # Fallback: Title extraction from page
            if not result.get('title'):
                title_tag = soup.find('h1') or soup.find('title')
                if title_tag:
                    result['title'] = title_tag.get_text(strip=True)
            # Fallback: Ingredients extraction – search for lists or containers
            if not result.get('ingredients'):
                ingredients = []
                for container in soup.find_all(True):
                    classes = ' '.join(container.get('class', [])).lower()
                    cid = (container.get('id') or '').lower()
                    if 'ingredient' not in classes and 'ingredient' not in cid:
                        continue
                    # Ignore parent wrappers that contain other ingredient sections.
                    # Collecting from both parent and child causes full-list duplicates.
                    if container.find(
                        lambda tag: tag is not container
                        and (
                            'ingredient' in ' '.join(tag.get('class', [])).lower()
                            or 'ingredient' in (tag.get('id') or '').lower()
                        )
                    ):
                        continue
                    # Skip comment or review sections
                    if any(word in classes for word in ['comment', 'review']):
                        continue
                    if any(word in cid for word in ['comment', 'review']):
                        continue
                    for li in container.find_all(['li', 'p']):
                        text = li.get_text(separator=' ', strip=True)
                        if text:
                            ingredients.append(text)
                if not ingredients:
                    for lst in soup.find_all(['ul', 'ol']):
                        classes = ' '.join(lst.get('class', [])).lower()
                        if 'ingredient' in classes:
                            for li in lst.find_all('li'):
                                text = li.get_text(separator=' ', strip=True)
                                if text:
                                    ingredients.append(text)

                if ingredients:
                    result['ingredients'] = _unique_preserve_order(ingredients)
            # Fallback: Steps extraction – look for headings like "Instructions" or "Process"
            if not result.get('steps'):
                steps = []
                keywords = ['instruction', 'direction', 'step', 'method', 'preparation', 'process']
                for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
                    text = heading.get_text(separator=' ', strip=True).lower()
                    if any(k in text for k in keywords):
                        for sib in heading.find_next_siblings():
                            if sib.name and sib.name.startswith('h'):
                                break
                            if sib.name in ['ol', 'ul']:
                                for li in sib.find_all('li'):
                                    t = li.get_text(separator=' ', strip=True)
                                    if t:
                                        steps.append(t)
                                continue
                            if sib.name == 'p':
                                t = sib.get_text(separator=' ', strip=True)
                                if t:
                                    steps.append(t)
                                continue
                            for li in sib.find_all(['li', 'p']):
                                t = li.get_text(separator=' ', strip=True)
                                if t:
                                    steps.append(t)
                        if steps:
                            break
                if not steps:
                    for container in soup.find_all(True):
                        classes = ' '.join(container.get('class', [])).lower()
                        cid = (container.get('id') or '').lower()
                        if not any(k in classes for k in ['instruction', 'direction', 'step']) and not any(
                            k in cid for k in ['instruction', 'direction', 'step']
                        ):
                            continue
                        # Skip comment or review sections
                        if any(word in classes for word in ['comment', 'review']):
                            continue
                        if any(word in cid for word in ['comment', 'review']):
                            continue
                        for li in container.find_all(['li', 'p']):
                            t = li.get_text(separator=' ', strip=True)
                            if t:
                                steps.append(t)
                if not steps:
                    # Fallback: first ordered list on the page
                    for ol in soup.find_all('ol'):
                        parent_classes = ' '.join(ol.parent.get('class', [])).lower() if ol.parent else ''
                        if 'comment' in parent_classes or 'review' in parent_classes:
                            continue
                        for li in ol.find_all('li'):
                            t = li.get_text(separator=' ', strip=True)
                            if t:
                                steps.append(t)
                        if steps:
                            break
                if steps:
                    result['steps'] = _unique_preserve_order(steps)
            # Fallback: Image extraction
            if not result.get('image'):
                meta = soup.find('meta', property='og:image') or soup.find('meta', attrs={'name': 'og:image'})
                if meta and meta.get('content'):
                    result['image'] = meta['content']
            if not result.get('image'):
                for img in soup.find_all('img', src=True):
                    src = img['src']
                    if src.startswith('data:'):
                        continue
                    alt = (img.get('alt') or '').lower()
                    if any(k in alt for k in ['logo', 'icon', 'avatar']):
                        continue
                    result['image'] = src
                    break
            # Links extraction
            links = []
            for a in soup.find_all('a', href=True):
                href = a['href']
                if href.startswith('http'):
                    links.append(href)
            if links:
                result['links'] = links
            self._set_headers(200, 'application/json')
            self.wfile.write(json.dumps(result).encode('utf-8'))
        except Exception as exc:
            self._set_headers(500, 'application/json')
            self.wfile.write(json.dumps({'error': 'Extraction failed', 'details': str(exc)}).encode('utf-8'))


def run_server():
    # Use PORT env var if present, default to 8000
    port = int(os.environ.get('PORT', '8000'))
    host = '0.0.0.0'
    httpd = HTTPServer((host, port), RecipeRequestHandler)
    print(f'Starting recipe extraction server on {host}:{port}...')
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()
