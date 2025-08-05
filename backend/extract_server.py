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
            # Title extraction
            title_tag = soup.find('h1') or soup.find('title')
            if title_tag:
                result['title'] = title_tag.get_text(strip=True)
            # Ingredients extraction – look for common patterns.  Many sites use
            # ``ul``/``ol`` lists or ``div`` containers with ``ingredient`` in the
            # class or id.  When gathering text, include a space separator to
            # preserve spacing between quantity and ingredient name (e.g. "2 large
            # eggs" instead of "2largeeggs").
            ingredients = []
            # First, search within elements whose class or id mentions
            # "ingredient" or "ingredients".  This catches recipes where the
            # ingredients are wrapped in a container.
            for container in soup.find_all(True, attrs={
                'class': lambda x: x and 'ingredient' in ' '.join(x).lower(),
                'id': lambda x: x and 'ingredient' in x.lower()
            }):
                for li in container.find_all(['li', 'p']):
                    text = li.get_text(separator=' ', strip=True)
                    if text:
                        ingredients.append(text)
            # If we didn't find ingredients in specific containers, fall back to
            # any ``ul`` or ``ol`` that has "ingredient" in its class name.
            if not ingredients:
                for lst in soup.find_all(['ul', 'ol']):
                    classes = ' '.join(lst.get('class', [])).lower()
                    if 'ingredient' in classes:
                        for li in lst.find_all('li'):
                            text = li.get_text(separator=' ', strip=True)
                            if text:
                                ingredients.append(text)
            if ingredients:
                result['ingredients'] = ingredients
            # Steps extraction – look for containers with "instruction", "direction"
            # or "step" in the class or id.  Use a space separator to preserve
            # spacing within the instructions.  If none are found, fall back to
            # ordered lists without class filtering.
            steps = []
            for container in soup.find_all(True, attrs={
                'class': lambda x: x and any(k in ' '.join(x).lower() for k in ['instruction', 'direction', 'step']),
                'id': lambda x: x and any(k in x.lower() for k in ['instruction', 'direction', 'step'])
            }):
                for li in container.find_all(['li', 'p']):
                    text = li.get_text(separator=' ', strip=True)
                    if text:
                        steps.append(text)
            # Fallback: if no steps found, include the first ordered list on the page
            if not steps:
                for ol in soup.find_all('ol'):
                    for li in ol.find_all('li'):
                        text = li.get_text(separator=' ', strip=True)
                        if text:
                            steps.append(text)
                    # Only take the first ``ol`` as a reasonable set of steps
                    if steps:
                        break
            if steps:
                result['steps'] = steps
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