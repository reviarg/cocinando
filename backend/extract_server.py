"""
extract_server.py – HTTP API for extracting and storing recipe information.

Endpoints:
- POST /extract: extract recipe data from a URL and persist it.
  Request JSON: {"url": "...", "user": "default", "tags": ["dinner", "italian"]}
- GET /recipes: list saved recipes.
  Query params: user, tag, limit, offset
- GET /recipes/<id>: fetch one saved recipe by id.
"""

import json
import os
import sqlite3
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

import requests
from bs4 import BeautifulSoup


DEFAULT_USER = 'default'
DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), 'recipes.db')


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


def _normalize_tags(tags):
    if tags is None:
        return []
    if isinstance(tags, str):
        tags = [tags]
    if not isinstance(tags, list):
        return []
    cleaned = []
    for tag in tags:
        if not isinstance(tag, str):
            continue
        normalized = _normalize_space(tag).lower()
        if normalized:
            cleaned.append(normalized)
    return _unique_preserve_order(cleaned)


def _db_path():
    return os.environ.get('DB_PATH', DEFAULT_DB_PATH)


def _get_conn():
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def _init_db():
    with _get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS recipes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                source_url TEXT NOT NULL,
                title TEXT,
                image_url TEXT,
                ingredients_json TEXT NOT NULL DEFAULT '[]',
                steps_json TEXT NOT NULL DEFAULT '[]',
                links_json TEXT NOT NULL DEFAULT '[]',
                raw_payload_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(user_id) REFERENCES users(id),
                UNIQUE(user_id, source_url)
            );

            CREATE TABLE IF NOT EXISTS recipe_tags (
                recipe_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY(recipe_id, tag),
                FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
            );
            """
        )


def _get_or_create_user(conn, username):
    username = _normalize_space(username or DEFAULT_USER)
    if not username:
        username = DEFAULT_USER
    conn.execute('INSERT OR IGNORE INTO users(username) VALUES (?)', (username,))
    row = conn.execute('SELECT id, username FROM users WHERE username = ?', (username,)).fetchone()
    return row['id'], row['username']


def _parse_json_list(value):
    try:
        parsed = json.loads(value or '[]')
        if isinstance(parsed, list):
            return parsed
    except Exception:
        pass
    return []


def _parse_json_dict(value):
    try:
        parsed = json.loads(value or '{}')
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    return {}


def _serialize_recipe_row(row):
    tags = []
    if row['tags_csv']:
        tags = [t for t in row['tags_csv'].split(',') if t]

    return {
        'id': row['id'],
        'user': row['username'],
        'source_url': row['source_url'],
        'title': row['title'],
        'image': row['image_url'],
        'ingredients': _parse_json_list(row['ingredients_json']),
        'steps': _parse_json_list(row['steps_json']),
        'links': _parse_json_list(row['links_json']),
        'tags': tags,
        'created_at': row['created_at'],
        'updated_at': row['updated_at'],
        'raw_payload': _parse_json_dict(row['raw_payload_json']),
    }


def _fetch_recipe_by_id(conn, recipe_id):
    row = conn.execute(
        """
        SELECT
            r.id,
            u.username,
            r.source_url,
            r.title,
            r.image_url,
            r.ingredients_json,
            r.steps_json,
            r.links_json,
            r.raw_payload_json,
            r.created_at,
            r.updated_at,
            COALESCE(GROUP_CONCAT(rt.tag), '') AS tags_csv
        FROM recipes r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
        WHERE r.id = ?
        GROUP BY r.id
        """,
        (recipe_id,),
    ).fetchone()
    if not row:
        return None
    return _serialize_recipe_row(row)


def _list_recipes(conn, username=None, tag=None, limit=50, offset=0):
    conditions = []
    params = []

    if username:
        conditions.append('u.username = ?')
        params.append(_normalize_space(username))

    if tag:
        conditions.append('EXISTS (SELECT 1 FROM recipe_tags t WHERE t.recipe_id = r.id AND t.tag = ?)')
        params.append(_normalize_space(tag).lower())

    where_clause = ''
    if conditions:
        where_clause = 'WHERE ' + ' AND '.join(conditions)

    params.extend([limit, offset])

    rows = conn.execute(
        f"""
        SELECT
            r.id,
            u.username,
            r.source_url,
            r.title,
            r.image_url,
            r.ingredients_json,
            r.steps_json,
            r.links_json,
            r.raw_payload_json,
            r.created_at,
            r.updated_at,
            COALESCE(GROUP_CONCAT(rt.tag), '') AS tags_csv
        FROM recipes r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN recipe_tags rt ON rt.recipe_id = r.id
        {where_clause}
        GROUP BY r.id
        ORDER BY r.updated_at DESC, r.id DESC
        LIMIT ? OFFSET ?
        """,
        params,
    ).fetchall()

    return [_serialize_recipe_row(r) for r in rows]


def _save_recipe(conn, username, source_url, extracted, tags):
    user_id, normalized_user = _get_or_create_user(conn, username)
    ingredients = _unique_preserve_order(extracted.get('ingredients', []))
    steps = _unique_preserve_order(extracted.get('steps', []))
    links = _unique_preserve_order(extracted.get('links', []))

    conn.execute(
        """
        INSERT INTO recipes(
            user_id,
            source_url,
            title,
            image_url,
            ingredients_json,
            steps_json,
            links_json,
            raw_payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, source_url) DO UPDATE SET
            title = excluded.title,
            image_url = excluded.image_url,
            ingredients_json = excluded.ingredients_json,
            steps_json = excluded.steps_json,
            links_json = excluded.links_json,
            raw_payload_json = excluded.raw_payload_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            user_id,
            source_url,
            extracted.get('title'),
            extracted.get('image'),
            json.dumps(ingredients),
            json.dumps(steps),
            json.dumps(links),
            json.dumps(extracted),
        ),
    )

    row = conn.execute(
        'SELECT id FROM recipes WHERE user_id = ? AND source_url = ?',
        (user_id, source_url),
    ).fetchone()
    recipe_id = row['id']

    normalized_tags = _normalize_tags(tags)
    conn.execute('DELETE FROM recipe_tags WHERE recipe_id = ?', (recipe_id,))
    for tag in normalized_tags:
        conn.execute(
            'INSERT OR IGNORE INTO recipe_tags(recipe_id, tag) VALUES (?, ?)',
            (recipe_id, tag),
        )

    recipe = _fetch_recipe_by_id(conn, recipe_id)
    recipe['user'] = normalized_user
    return recipe


def extract_recipe(url):
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/117 Safari/537.36'
        )
    }
    resp = requests.get(url, headers=headers, timeout=10)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, 'html.parser')
    result = {}

    # Attempt to parse structured recipe metadata (JSON-LD)
    try:
        for script in soup.find_all('script', type=lambda t: t and 'ld+json' in t):
            try:
                data = json.loads(script.string or '')
            except Exception:
                continue
            entries = data if isinstance(data, list) else [data]
            for entry in entries:
                if isinstance(entry, dict) and entry.get('@type') == 'Recipe':
                    if not result.get('title') and entry.get('name'):
                        result['title'] = entry['name']
                    if entry.get('recipeIngredient'):
                        result['ingredients'] = _unique_preserve_order(
                            [i.strip() for i in entry['recipeIngredient'] if i.strip()]
                        )
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
                            steps = [s.strip() for s in inst.split('\n') if s.strip()]
                        if steps:
                            result['steps'] = _unique_preserve_order(steps)
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
                    break
            if result.get('ingredients') or result.get('steps'):
                break
    except Exception:
        pass

    if not result.get('title'):
        title_tag = soup.find('h1') or soup.find('title')
        if title_tag:
            result['title'] = title_tag.get_text(strip=True)

    if not result.get('ingredients'):
        ingredients = []
        for container in soup.find_all(True):
            classes = ' '.join(container.get('class', [])).lower()
            cid = (container.get('id') or '').lower()
            if 'ingredient' not in classes and 'ingredient' not in cid:
                continue
            if container.find(
                lambda tag: tag is not container
                and (
                    'ingredient' in ' '.join(tag.get('class', [])).lower()
                    or 'ingredient' in (tag.get('id') or '').lower()
                )
            ):
                continue
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
                if any(word in classes for word in ['comment', 'review']):
                    continue
                if any(word in cid for word in ['comment', 'review']):
                    continue
                for li in container.find_all(['li', 'p']):
                    t = li.get_text(separator=' ', strip=True)
                    if t:
                        steps.append(t)

        if not steps:
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

    links = []
    for a in soup.find_all('a', href=True):
        href = a['href']
        if href.startswith('http'):
            links.append(href)
    if links:
        result['links'] = _unique_preserve_order(links)

    return result


class RecipeRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.end_headers()

    def _read_json_body(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body)

    def do_GET(self):
        parsed = urlparse(self.path)

        if parsed.path == '/':
            self._set_headers(200, 'text/plain')
            self.wfile.write(b'Cocinando extractor running')
            return

        if parsed.path == '/recipes':
            try:
                qs = parse_qs(parsed.query)
                user = qs.get('user', [None])[0]
                tag = qs.get('tag', [None])[0]
                limit = int(qs.get('limit', ['50'])[0])
                offset = int(qs.get('offset', ['0'])[0])
                if limit < 1:
                    limit = 1
                if limit > 200:
                    limit = 200
                if offset < 0:
                    offset = 0

                with _get_conn() as conn:
                    recipes = _list_recipes(conn, username=user, tag=tag, limit=limit, offset=offset)

                self._set_headers(200, 'application/json')
                self.wfile.write(
                    json.dumps({'recipes': recipes, 'limit': limit, 'offset': offset}).encode('utf-8')
                )
                return
            except Exception as exc:
                self._set_headers(500, 'application/json')
                self.wfile.write(json.dumps({'error': 'Failed to list recipes', 'details': str(exc)}).encode('utf-8'))
                return

        if parsed.path.startswith('/recipes/'):
            try:
                recipe_id = int(parsed.path.split('/')[-1])
            except Exception:
                self._set_headers(400, 'application/json')
                self.wfile.write(json.dumps({'error': 'Invalid recipe id'}).encode('utf-8'))
                return

            try:
                with _get_conn() as conn:
                    recipe = _fetch_recipe_by_id(conn, recipe_id)

                if not recipe:
                    self._set_headers(404, 'application/json')
                    self.wfile.write(json.dumps({'error': 'Recipe not found'}).encode('utf-8'))
                    return

                self._set_headers(200, 'application/json')
                self.wfile.write(json.dumps(recipe).encode('utf-8'))
                return
            except Exception as exc:
                self._set_headers(500, 'application/json')
                self.wfile.write(json.dumps({'error': 'Failed to fetch recipe', 'details': str(exc)}).encode('utf-8'))
                return

        self._set_headers(404, 'application/json')
        self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/extract':
            self._set_headers(404, 'application/json')
            self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))
            return

        try:
            data = self._read_json_body()
            source_url = data.get('url')
            username = data.get('user', DEFAULT_USER)
            tags = data.get('tags', [])
            if not source_url:
                raise ValueError('Missing URL')
        except Exception:
            self._set_headers(400, 'application/json')
            self.wfile.write(json.dumps({'error': 'Invalid request body'}).encode('utf-8'))
            return

        try:
            extracted = extract_recipe(source_url)
            with _get_conn() as conn:
                recipe = _save_recipe(conn, username, source_url, extracted, tags)
                conn.commit()

            self._set_headers(200, 'application/json')
            self.wfile.write(json.dumps(recipe).encode('utf-8'))
        except Exception as exc:
            self._set_headers(500, 'application/json')
            self.wfile.write(json.dumps({'error': 'Extraction failed', 'details': str(exc)}).encode('utf-8'))


def run_server():
    _init_db()
    port = int(os.environ.get('PORT', '8000'))
    host = '0.0.0.0'
    httpd = HTTPServer((host, port), RecipeRequestHandler)
    print(f'Starting recipe extraction server on {host}:{port} (db: {_db_path()})...')
    httpd.serve_forever()


if __name__ == '__main__':
    run_server()
