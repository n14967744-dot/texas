#!/usr/bin/env python3
"""Build the app-owned distance cache in the `leads` schema (never touches TABS tables).

Tables (created if missing):
  leads.project_geocodes     one row per TABS project_number: US Census Geocoder address match
                             (precision 'address') or 'none' when the Census batch geocoder found
                             no match. Re-geocoded when the project's address text changes.
  leads.tx_place_centroids   US Census 2024 Gazetteer centroids for Texas places (kind 'city') and
                             counties (kind 'county'). The app uses these as clearly-labelled
                             approximate fallbacks when no address match exists.

Usage:
  set -a; . ~/.secrets/texas-db.env; set +a
  python3 scripts/geocode_projects.py --centroids /path/to/gazetteer   # load place/county centroids
  python3 scripts/geocode_projects.py --limit 10000                    # geocode new/changed addresses

Census batch geocoder: https://geocoding.geo.census.gov/geocoder/ (free, no key, <=10,000 rows/request).
"""
import argparse, csv, http.client, io, json, os, re, sys, time, urllib.parse, urllib.request, uuid

CENSUS_BATCH = 'https://geocoding.geo.census.gov/geocoder/locations/addressbatch'
SOURCE = 'US Census Geocoder batch (Public_AR_Current)'
GAZ_SOURCE = 'US Census 2024 Gazetteer (place/county internal point)'

def post(url, body, headers, timeout):
    request = urllib.request.Request(url, data=body, headers=headers, method='POST')
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode('utf-8-sig')

def sql(queries, read_only=False):
    conn = os.environ['DATABASE_URL']
    host = urllib.parse.urlparse(conn).hostname
    headers = {'Neon-Connection-String': conn, 'Content-Type': 'application/json'}
    if read_only: headers['Neon-Batch-Read-Only'] = 'true'
    for attempt in range(4):
        try:
            data = post(f'https://{host}/sql', json.dumps({'queries': queries}).encode(), headers, 120)
            return [res['rows'] for res in json.loads(data)['results']]
        except (OSError, http.client.HTTPException, ValueError, KeyError, TypeError):
            if attempt == 3: raise RuntimeError('SQL failed after retries; response and credentials omitted.') from None
        time.sleep(3 * (attempt + 1))

DDL = [
    {'query': """CREATE TABLE IF NOT EXISTS leads.project_geocodes (
        project_number text PRIMARY KEY,
        input_address text NOT NULL,
        lat double precision,
        lng double precision,
        precision text NOT NULL CHECK (precision IN ('address','none')),
        match_type text,
        matched_address text,
        source text NOT NULL,
        geocoded_at timestamptz NOT NULL DEFAULT now())""", 'params': []},
    {'query': """CREATE TABLE IF NOT EXISTS leads.tx_place_centroids (
        kind text NOT NULL CHECK (kind IN ('city','county')),
        name_key text NOT NULL,
        display_name text NOT NULL,
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        geoid text,
        source text NOT NULL,
        PRIMARY KEY (kind, name_key))""", 'params': []},
]

def norm(s):
    return ' '.join((s or '').upper().replace('.', '').split())

def load_centroids(folder):
    rows = {}
    rank = {'city': 0, 'town': 0, 'village': 0, 'CDP': 1}
    with open(os.path.join(folder, '2024_Gaz_place_national.txt'), encoding='latin-1') as f:
        for rec in csv.DictReader(f, delimiter='\t'):
            rec = {k.strip(): (v or '').strip() for k, v in rec.items()}
            if rec['USPS'] != 'TX': continue
            name = rec['NAME']
            base, _, suffix = name.rpartition(' ')
            if suffix not in rank: base, suffix = name, 'other'
            key = ('city', norm(base))
            r = rank.get(suffix, 2)
            if key not in rows or r < rows[key][0]:
                rows[key] = (r, {'kind': 'city', 'name_key': norm(base), 'display_name': name,
                                 'lat': float(rec['INTPTLAT']), 'lng': float(rec['INTPTLONG']), 'geoid': rec['GEOID'], 'source': GAZ_SOURCE})
    with open(os.path.join(folder, '2024_Gaz_counties_national.txt'), encoding='latin-1') as f:
        for rec in csv.DictReader(f, delimiter='\t'):
            rec = {k.strip(): (v or '').strip() for k, v in rec.items()}
            if rec['USPS'] != 'TX': continue
            base = rec['NAME'].removesuffix(' County')
            rows[('county', norm(base))] = (0, {'kind': 'county', 'name_key': norm(base), 'display_name': rec['NAME'],
                                                 'lat': float(rec['INTPTLAT']), 'lng': float(rec['INTPTLONG']), 'geoid': rec['GEOID'], 'source': GAZ_SOURCE})
    data = [v for _, v in rows.values()]
    sql([{'query': """INSERT INTO leads.tx_place_centroids (kind,name_key,display_name,lat,lng,geoid,source)
        SELECT kind,name_key,display_name,lat,lng,geoid,source FROM json_to_recordset($1::json)
          AS x(kind text,name_key text,display_name text,lat double precision,lng double precision,geoid text,source text)
        ON CONFLICT (kind,name_key) DO UPDATE SET display_name=EXCLUDED.display_name, lat=EXCLUDED.lat, lng=EXCLUDED.lng, geoid=EXCLUDED.geoid, source=EXCLUDED.source""",
          'params': [json.dumps(data)]}])
    print(f'centroids upserted: {len(data)}')

def address_key(p):
    return ' | '.join([(p['location_address'] or '').strip(), (p['location_city'] or '').strip(), (p['location_zip'] or '').strip()])

def census_batch(items):
    buf = io.StringIO()
    w = csv.writer(buf)
    for i, (street, city, zip_) in enumerate(items):
        w.writerow([i, street, city, 'TX', zip_])
    boundary = 'census-' + uuid.uuid4().hex
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="benchmark"\r\n\r\n'
            f'Public_AR_Current\r\n--{boundary}\r\n'
            'Content-Disposition: form-data; name="addressFile"; filename="a.csv"\r\n'
            f'Content-Type: text/csv\r\n\r\n{buf.getvalue()}\r\n--{boundary}--\r\n').encode()
    for attempt in range(3):
        try:
            text = post(CENSUS_BATCH, body, {'Content-Type': f'multipart/form-data; boundary={boundary}'}, 120)
            return parse_census(text, len(items))
        except (OSError, http.client.HTTPException, csv.Error, ValueError):
            print(f'Census request/response failed (attempt {attempt + 1}/3).', file=sys.stderr)
        if attempt < 2: time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError('Census batch failed repeatedly')

def parse_census(text, expected):
    out = {}
    seen = set()
    for row in csv.reader(io.StringIO(text)):
        if not row: continue
        if len(row) < 3: raise ValueError('Incomplete Census response')
        idx = int(row[0])
        if idx not in range(expected) or idx in seen or row[2] not in ('Match', 'No_Match', 'Tie'):
            raise ValueError('Unexpected Census result')
        seen.add(idx)
        if row[2] == 'Match':
            if len(row) < 6 or ',' not in row[5]: raise ValueError('Missing Census coordinates')
            lng, lat = (float(v) for v in row[5].split(','))
            if not (-90 <= lat <= 90 and -180 <= lng <= 180): raise ValueError('Invalid Census coordinates')
            out[idx] = {'lat': lat, 'lng': lng, 'match_type': row[3], 'matched_address': row[4]}
    if len(seen) != expected: raise ValueError('Truncated Census response')
    return out

def geocode(limit, chunk):
    projects = sql([{'query': """SELECT p.project_number, p.location_address, p.location_city, p.location_zip
        FROM public.projects p LEFT JOIN leads.project_geocodes g ON g.project_number = p.project_number
        WHERE g.project_number IS NULL
           OR g.input_address <> concat_ws(' | ', btrim(coalesce(p.location_address,'')), btrim(coalesce(p.location_city,'')), btrim(coalesce(p.location_zip,'')))
        ORDER BY p.registration_date DESC NULLS LAST, p.project_number
        LIMIT $1""", 'params': [limit]}], read_only=True)[0]
    by_addr = {}
    for p in projects:
        by_addr.setdefault(address_key(p), []).append(p)
    keys = list(by_addr)
    print(f'{len(projects)} projects selected for geocoding ({len(keys)} unique addresses)')
    done = 0
    for start in range(0, len(keys), chunk):
        part = keys[start:start + chunk]
        items = [((by_addr[k][0]['location_address'] or '').strip(), (by_addr[k][0]['location_city'] or '').strip(), (by_addr[k][0]['location_zip'] or '').strip()) for k in part]
        t0 = time.time()
        try:
            matches = census_batch(items)
        except RuntimeError:
            print(f'Census batch {start // chunk + 1} failed; leaving {len(part)} addresses pending for a later run.', file=sys.stderr, flush=True)
            continue
        rows = []
        for i, k in enumerate(part):
            m = matches.get(i)
            for p in by_addr[k]:
                rows.append({'project_number': p['project_number'], 'input_address': k,
                             'lat': m['lat'] if m else None, 'lng': m['lng'] if m else None,
                             'precision': 'address' if m else 'none',
                             'match_type': m['match_type'] if m else None,
                             'matched_address': m['matched_address'] if m else None, 'source': SOURCE})
        for s in range(0, len(rows), 2000):
            sql([{'query': """INSERT INTO leads.project_geocodes (project_number,input_address,lat,lng,precision,match_type,matched_address,source)
                SELECT project_number,input_address,lat,lng,precision,match_type,matched_address,source FROM json_to_recordset($1::json)
                  AS x(project_number text,input_address text,lat double precision,lng double precision,precision text,match_type text,matched_address text,source text)
                ON CONFLICT (project_number) DO UPDATE SET input_address=EXCLUDED.input_address, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
                  precision=EXCLUDED.precision, match_type=EXCLUDED.match_type, matched_address=EXCLUDED.matched_address,
                  source=EXCLUDED.source, geocoded_at=now()""", 'params': [json.dumps(rows[s:s + 2000])]}])
        done += len(part)
        print(f'batch {start // chunk + 1}: {len(matches)}/{len(part)} addresses matched, {len(rows)} projects written, {time.time() - t0:.0f}s (total {done})', flush=True)

SUITE_RE = re.compile(r'(?:,?\s*(?:\b(?:suite|ste\.?|unit|bldg\.?|building|floor|fl\.?|room|rm\.?)(?![a-z])|#)\s*[-:#]?\s*[\w-]+(?:\s*(?:&|and)\s*[\w-]+)?)|(?:,?\s*\b\d+(?:st|nd|rd|th)\s+floor\b)', re.I)

def clean_street(street, city):
    s = street or ''
    s = re.sub(r'\b(\d+)\s+1/2\b', r'\1', s)
    s = SUITE_RE.sub('', s)
    if city:  # drop a repeated ", City, TX 77xxx" tail
        s = re.split(r',?\s+' + re.escape(city) + r',?\s+(?:TX|Texas)\b', s, flags=re.I)[0]
    parts = [x.strip() for x in s.split(',') if x.strip()]
    s = next((x for x in parts if re.match(r'^\d', x)), parts[0] if parts else '')
    return ' '.join(s.split()).strip(' ,.-')

def retry_clean(chunk):
    rows = sql([{'query': """SELECT g.project_number, g.input_address, p.location_address, p.location_city, p.location_zip
        FROM leads.project_geocodes g JOIN public.projects p USING (project_number)
        WHERE g.precision = 'none' AND coalesce(g.match_type,'') <> 'retried'""", 'params': []}], read_only=True)[0]
    groups = {}
    for p in rows:
        street = clean_street(p['location_address'], p['location_city'])
        if not re.match(r'^\d', street) or street.upper() == (p['location_address'] or '').strip().upper():
            continue  # nothing cleaner to try, or no house number
        groups.setdefault((street, (p['location_city'] or '').strip(), (p['location_zip'] or '').strip()), []).append(p)
    keys = list(groups)
    print(f'{len(rows)} unmatched projects; {len(keys)} cleaned addresses to retry')
    for start in range(0, len(keys), chunk):
        part = keys[start:start + chunk]
        try:
            matches = census_batch(part)
        except RuntimeError:
            print(f'Census retry batch {start // chunk + 1} failed; leaving addresses pending.', file=sys.stderr, flush=True)
            continue
        out = []
        for i, k in enumerate(part):
            m = matches.get(i)
            for p in groups[k]:
                out.append({'project_number': p['project_number'], 'lat': m['lat'] if m else None, 'lng': m['lng'] if m else None,
                            'precision': 'address' if m else 'none',
                            'match_type': ('cleaned-' + m['match_type'].lower()) if m else 'retried',
                            'matched_address': m['matched_address'] if m else None})
        for s in range(0, len(out), 2000):
            sql([{'query': """UPDATE leads.project_geocodes g SET lat=x.lat, lng=x.lng, precision=x.precision, match_type=x.match_type,
                matched_address=x.matched_address, geocoded_at=now()
                FROM json_to_recordset($1::json) AS x(project_number text, lat double precision, lng double precision, precision text, match_type text, matched_address text)
                WHERE g.project_number = x.project_number""", 'params': [json.dumps(out[s:s + 2000])]}])
        print(f'retry batch {start // chunk + 1}: {len(matches)}/{len(part)} matched', flush=True)

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--centroids', help='folder with 2024_Gaz_place_national.txt and 2024_Gaz_counties_national.txt')
    ap.add_argument('--limit', type=int, default=0, help='max new/changed projects to geocode, grouped by address (0 = skip geocoding)')
    ap.add_argument('--chunk', type=int, default=2500, help='addresses per Census batch request (max 10000)')
    ap.add_argument('--retry-clean', action='store_true', help='retry unmatched rows with suite/floor/duplicate-city text stripped')
    a = ap.parse_args()
    if a.limit < 0 or a.chunk < 1: ap.error('limit must be nonnegative and chunk must be positive')
    sql(DDL)
    if a.centroids: load_centroids(a.centroids)
    if a.limit: geocode(a.limit, min(a.chunk, 10000))
    if a.retry_clean: retry_clean(min(a.chunk, 10000))
