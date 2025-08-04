#!/usr/bin/env python3
"""
A lightweight HTTP server to extract recipe information from a given URL.

This server exposes a single POST endpoint at `/extract` that accepts a JSON
payload with a `url` field. It fetches the contents of the URL, attempts to
parse the title, ingredients, steps, and links using BeautifulSoup and simple
heuristics, and returns the data as JSON. CORS headers are added to allow
requests from any origin.

Note: This server is intended to run locally alongside the static front‑end.
External network access may be restricted in this environment, so fetching
remote URLs may fail. If running in a different environment, ensure that
outbound connections are permitted.
"""

import json
import re
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse
from typing import List, Dict

import requests
from bs4 import BeautifulSoup


def extract_recipe(url: str) -> Dict[str, object]:
    """Fetch and parse a recipe page, attempting to extract useful fields.

    Args:
        url: The URL of the recipe page.

    Returns:
        A dictionary with keys `title` (str), `ingredients` (list of str),
        `steps` (list of str), and `links` (list of str). Missing fields are
        returned as empty strings or lists.
    """
    result = {"title": "", "ingredients": [], "steps": [], "links": []}
    try:
        # Use a desktop user agent to avoid some bot protections
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 "
                "Safari/537.3"
            )
        }
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
    except Exception as exc:
        # Could not retrieve the page
        result["title"] = f"Error fetching URL: {exc}"
        return result

    soup = BeautifulSoup(resp.content, "html.parser")

    # Extract title from meta tags or <title>
    def get_title() -> str:
        title = ""
        # Prefer Open Graph title
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"]
        if not title:
            meta_title = soup.find("meta", attrs={"name": "title"})
            if meta_title and meta_title.get("content"):
                title = meta_title["content"]
        if not title and soup.title:
            title = soup.title.get_text(strip=True)
        return title.strip()

    # Heuristic to identify ingredient lines
    measurement_keywords = [
        "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon",
        "teaspoons", "kg", "g", "gram", "grams", "ml", "l", "ounce", "ounces",
        "oz", "lb", "pound", "clove", "cloves", "slice", "slices", "stick",
        "sticks", "dash", "pinch", "quart", "pint", "sprig", "sprigs",
    ]
    measurement_re = re.compile(r"\b(" + "|".join(re.escape(k) for k in measurement_keywords) + r")\b", re.IGNORECASE)

    def get_ingredients() -> List[str]:
        ingredients: List[str] = []
        # Look for list items that appear to be ingredients
        for li in soup.find_all("li"):
            text = li.get_text(separator=" ", strip=True)
            if not text or len(text.split()) > 50:
                continue
            cls = " ".join(li.get("class", []))
            if "ingredient" in cls.lower() or "ingredients" in cls.lower():
                ingredients.append(text)
            elif measurement_re.search(text):
                ingredients.append(text)
        # Deduplicate while preserving order
        seen = set()
        unique_ingredients = []
        for item in ingredients:
            if item.lower() not in seen:
                unique_ingredients.append(item)
                seen.add(item.lower())
        return unique_ingredients

    def get_steps() -> List[str]:
        steps: List[str] = []
        # Look for ordered lists or paragraphs with class names indicating steps
        for container in soup.find_all(["ol", "ul", "div", "section"]):
            cls = " ".join(container.get("class", []))
            if any(word in cls.lower() for word in ["instruction", "direction", "step", "steps"]):
                # collect text from list items and paragraphs
                for child in container.find_all(["li", "p"]):
                    txt = child.get_text(separator=" ", strip=True)
                    if txt and len(txt.split()) >= 3:
                        steps.append(txt)
        # Fallback: search for paragraphs that look like instructions
        if not steps:
            for p in soup.find_all("p"):
                txt = p.get_text(separator=" ", strip=True)
                # consider a paragraph a step if it starts with a verb or contains imperative verbs
                if txt and len(txt.split()) >= 3 and re.match(r"^(\d+\.\s*)?[A-Za-z]", txt):
                    # Avoid extremely long paragraphs
                    if len(txt) < 300:
                        steps.append(txt)
                if len(steps) >= 10:
                    break
        # Deduplicate
        cleaned = []
        seen = set()
        for step in steps:
            st = step.strip()
            if st.lower() not in seen:
                cleaned.append(st)
                seen.add(st.lower())
        return cleaned

    def get_links() -> List[str]:
        links: List[str] = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.startswith("http"):
                links.append(href)
        # Remove duplicates and limit count
        uniq = []
        seen = set()
        for link in links:
            if link not in seen:
                uniq.append(link)
                seen.add(link)
            if len(uniq) >= 20:
                break
        return uniq

    result["title"] = get_title()
    result["ingredients"] = get_ingredients()
    result["steps"] = get_steps()
    result["links"] = get_links()
    return result


class RecipeRequestHandler(BaseHTTPRequestHandler):
    """HTTP handler to process recipe extraction requests."""

    def _set_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        # Allow cross‑origin requests from any origin
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        # Respond to preflight CORS requests
        self._set_headers()

    def do_POST(self):
        parsed_path = urlparse(self.path)
        if parsed_path.path != "/extract":
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not Found"}).encode("utf-8"))
            return
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8"))
            url = payload.get("url", "").strip()
            if not url:
                raise ValueError("Missing 'url' field")
        except Exception as exc:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": f"Invalid request: {exc}"}).encode("utf-8"))
            return
        # Perform extraction
        data = extract_recipe(url)
        self._set_headers(200)
        self.wfile.write(json.dumps(data).encode("utf-8"))


def run_server(host="localhost", port=8000):
    """Start the HTTP server."""
    server = HTTPServer((host, port), RecipeRequestHandler)
    print(f"Starting recipe extraction server on {host}:{port}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print("Server stopped.")


if __name__ == "__main__":
    run_server()