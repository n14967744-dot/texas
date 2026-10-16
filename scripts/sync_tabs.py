#!/usr/bin/env python3
"""Incremental public TABS -> Neon sync. Python 3.12+, standard library only.

Only successfully parsed detail pages are written. Never deletes projects.
Run with DATABASE_URL in the environment; --dry-run performs no DB writes.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from decimal import Decimal
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from zoneinfo import ZoneInfo

BASE = 'https://www.tdlr.texas.gov'
SECTIONS = ('project', 'contact', 'ras', 'owner', 'tenant', 'designer')
STATUSES = dict(zip(range(3001, 3011), (
    'Inspection Completed', 'Inspection Process', 'Inspection Scheduled',
    'Preliminary Plan Review', 'Miscellaneous', 'Preliminary Review Pending',
    'Project Closed', 'Project Registered', 'Review Complete', 'Review Pending')))
WORK = {9001: 'New Construction', 9002: 'Renovation/Alteration',
        9003: 'Additions to Existing Building', 9004: 'Historic Preservation',
        9005: 'Public Right of Way'}


class SyncError(Exception):
    """Safe to print; never contains HTTP bodies or connection credentials."""


def clean(text):
    return re.sub(r'\s+', ' ', text).strip()


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return clean(' '.join(c.text() if isinstance(c, Node) else c for c in self.children))

    def find(self, tag=None, css=None):
        for child in self.children:
            if not isinstance(child, Node):
                continue
            if (tag is None or child.tag == tag) and (css is None or css in child.attrs.get('class', '').split()):
                yield child
            yield from child.find(tag, css)


class Document(HTMLParser):
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}

    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs)
        self.stack[-1].children.append(n)
        if tag not in self.VOID:
            self.stack.append(n)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def iso_date(value):
    if not value or value.lower() in ('n/a', 'not assigned', 'unknown'):
        return None
    for fmt in ('%m/%d/%Y', '%Y-%m-%d'):
        try:
            return datetime.strptime(value[:10] if fmt == '%Y-%m-%d' else value, fmt).date().isoformat()
        except ValueError:
            pass
    raise SyncError('Unrecognized source date; refusing to overwrite existing data.')


def number(value, integer=False):
    if not value or value.lower() in ('n/a', 'not assigned', 'unknown'):
        return None
    match = re.search(r'\d[\d,]*(?:\.\d+)?', value)
    if not match:
        raise SyncError('Unrecognized source number.')
    n = Decimal(match.group().replace(',', ''))
    return int(n) if integer else str(n)


def parse_detail(html, expected):
    if not re.fullmatch(r'(?:TABS|EABPRJ)[A-Za-z0-9-]+', expected):
        raise SyncError('Invalid project number.')
    root = Document(html).root
    sections = {}
    for suffix in SECTIONS:
        key = 'project-details-' + suffix
        nodes = list(root.find(css=key))
        if len(nodes) != 1:
            raise SyncError('Source detail layout changed or incomplete page; no write.')
        values = {}
        for dl in nodes[0].find(tag='dl'):
            label = None
            for node in dl.children:
                if not isinstance(node, Node):
                    continue
                if node.tag == 'dt':
                    label = node.text().rstrip(':')
                    values[label] = []
                elif node.tag == 'dd' and label:
                    values[label].append(node.text())
        sections[key] = {k: ' | '.join(v) for k, v in values.items()}
        if not values:
            note = ' '.join(n.text() for n in nodes[0].find(tag='p'))
            if note != 'Not Assigned':
                raise SyncError('Missing source contact section; no write.')
            sections[key] = {'_note': note}
    p = sections['project-details-project']
    if p.get('Project Number') != expected or not p.get('Project Name'):
        raise SyncError('Detail identity does not match search result; no write.')
    for label in ('Start Date', 'Completion Date', 'Location Address', 'Current Status', 'Scope of Work', 'Estimated Cost'):
        if label not in p:
            raise SyncError('Required source labels missing; no write.')
    headers = list(root.find(css='project-details-header'))
    reg = re.search(r'Registration Date:\s*(\d{1,2}/\d{1,2}/\d{4})', headers[0].text() if headers else '')
    if not reg:
        raise SyncError('Missing source registration date; no write.')
    address = p['Location Address'].split(' | ')
    cityline = re.fullmatch(r'(.+),\s*([A-Za-z ]+)\s+(\d{5}(?:-\d{4})?)', address[-1])
    if len(address) < 2 or not cityline:
        raise SyncError('Unrecognized project address; no write.')
    row = dict(project_number=expected, project_name=p['Project Name'], facility_name=p.get('Facility Name') or None,
               registration_date=iso_date(reg.group(1)), location_address=' | '.join(address[:-1]),
               location_city=cityline[1], location_state=cityline[2], location_zip=cityline[3],
               location_county=p.get('Location County') or None, start_date=iso_date(p['Start Date']),
               completion_date=iso_date(p['Completion Date']), estimated_cost=number(p['Estimated Cost']),
               estimated_cost_raw=p['Estimated Cost'], type_of_work=p.get('Type of Work') or None,
               type_of_funds=p.get('Type of Funds') or None, scope_of_work=p['Scope of Work'] or None,
               square_footage=number(p.get('Square Footage'), integer=True), square_footage_raw=p.get('Square Footage'),
               tenant_private_funds=p.get('Are the private funds provided by the tenant?') or None,
               current_status=p['Current Status'] or None,
               filer_contact_name=sections['project-details-contact'].get('Contact Name') or None,
               tenant_assigned='_note' not in sections['project-details-tenant'],
               project_url=f'{BASE}/TABS/Search/Project/{expected}', sections=json.dumps(sections))
    for suffix, prefix, labels in (
        ('ras', 'ras', {'name': 'RAS Name', 'number': 'RAS #', 'address': 'RAS Address', 'phone': 'RAS Phone'}),
        ('owner', 'owner', {'name': 'Owner Name', 'address': 'Owner Address', 'phone': 'Owner Phone', 'contact_name': 'Contact Name'}),
        ('tenant', 'tenant', {'name': 'Tenant Name', 'address': 'Tenant Address', 'phone': 'Tenant Phone', 'contact_name': 'Contact Name'}),
        ('designer', 'design_firm', {'name': 'Design Firm Name', 'address': 'Design Firm Address', 'phone': 'Design Firm Phone'})):
        for col, label in labels.items():
            row[prefix + '_' + col] = sections['project-details-' + suffix].get(label) or None
    return row


class Http:
    def __init__(self):
        self.lock = threading.Lock()
        self.next_request = 0

    def request(self, url, data=None, headers=None, source=True):
        for attempt in range(4):
            if source:
                with self.lock:
                    time.sleep(max(0, self.next_request - time.monotonic()))
                    self.next_request = time.monotonic() + 0.5  # At most 2 source requests/sec across workers.
            request = urllib.request.Request(url, data=data, headers={'User-Agent': 'CTWP-Project-Sync/1.0', **(headers or {})})
            try:
                with urllib.request.urlopen(request, timeout=60) as response:
                    return response.read().decode('utf-8-sig')
            except urllib.error.HTTPError as e:
                if e.code not in (429, 500, 502, 503, 504):
                    raise SyncError(f'HTTP {e.code} from {"TABS" if source else "database"}.') from None
                wait = e.headers.get('Retry-After', '')
                time.sleep(min(120, int(wait)) if wait.isdigit() else 2 ** (attempt + 1))
            except (OSError, TimeoutError):
                time.sleep(2 ** (attempt + 1))
        raise SyncError(f'{"TABS" if source else "Database"} unavailable after retries.')


class Database:
    def __init__(self, http, connection):
        url = urllib.parse.urlsplit(connection)
        if url.scheme not in ('postgres', 'postgresql') or not (url.hostname or '').endswith('.neon.tech'):
            raise SyncError('DATABASE_URL must be a Neon PostgreSQL connection string.')
        self.http, self.connection, self.endpoint = http, connection, 'https://' + url.hostname + '/sql'

    def query(self, sql, params=None):
        response = self.http.request(self.endpoint, json.dumps({'query': sql, 'params': params or []}).encode(),
            {'Content-Type': 'application/json', 'Neon-Connection-String': self.connection}, source=False)
        data = json.loads(response)
        if not isinstance(data.get('rows'), list):
            raise SyncError('Unexpected database response.')
        return data['rows']

    def upsert(self, row):
        # Keys come exclusively from this module, never from source page labels.
        cols = list(row)
        params = [row[k] for k in cols]
        values = [f'${i+1}' + ('::jsonb' if k == 'sections' else '') for i, k in enumerate(cols)]
        updates = ', '.join(f'{k}=EXCLUDED.{k}' for k in cols if k != 'project_number')
        return self.query(f"INSERT INTO public.projects ({', '.join(cols)}, fetched_at) VALUES ({', '.join(values)}, now()) "
                          f"ON CONFLICT (project_number) DO UPDATE SET {updates}, fetched_at=now() RETURNING (xmax=0) AS inserted", params)[0]['inserted']


def search(http, begin, end):
    # Capture an upper registration date and use ascending order. Deduplicate pages.
    seen, offset, total = set(), 0, None
    while True:
        form = {'draw': 1, 'start': offset, 'length': 100,
                'order[0][column]': 3, 'order[0][dir]': 'asc', 'columns[3][data]': 'ProjectCreatedOn',
                'RegistrationDateBegin': begin.strftime('%m/%d/%Y'), 'RegistrationDateEnd': end.strftime('%m/%d/%Y')}
        data = json.loads(http.request(BASE + '/TABS/Search/SearchProjects', urllib.parse.urlencode(form).encode(),
                                      {'X-Requested-With': 'XMLHttpRequest'}))
        rows, expected = data.get('data'), data.get('recordsFiltered')
        if not isinstance(rows, list) or not isinstance(expected, int) or expected < 0:
            raise SyncError('Unexpected TABS search response.')
        total = expected
        if not rows and offset < total:
            raise SyncError('TABS returned a truncated search; checkpoint will not advance.')
        for row in rows:
            key = row.get('ProjectNumber', '')
            if not re.fullmatch(r'(?:TABS|EABPRJ)[A-Za-z0-9-]+', key):
                raise SyncError('Unexpected search project identifier.')
            if key not in seen:
                seen.add(key)
                yield row
        offset += len(rows)
        if offset >= total:
            break
    if len(seen) < total:
        raise SyncError('Search pagination changed; checkpoint will not advance.')


def enrich(http, item):
    key = item['ProjectNumber']
    row = parse_detail(http.request(BASE + '/TABS/Search/Project/' + key), key)
    for col, source in {'project_id': 'ProjectId', 'project_created_on': 'ProjectCreatedOn',
                        'index_status_code': 'ProjectStatus', 'city_code': 'City', 'county_code': 'County',
                        'work_type_code': 'TypeOfWork', 'data_version_id': 'DataVersionId'}.items():
        if source in item:
            row[col] = item[source]
    # Some legacy detail pages leave the status blank; search's known label is usable.
    if not row['current_status'] and item.get('ProjectStatus') in STATUSES:
        row['current_status'] = STATUSES[item['ProjectStatus']]
    return row


def discovery_start(checkpoint, latest, today):
    # The checkpoint only advances after every discovered page/detail succeeds.
    value = checkpoint or latest
    if not value:
        raise SyncError('Empty database: pass --since YYYY-MM-DD to choose a backfill start.')
    return min(date.fromisoformat(value[:10]), today) - timedelta(days=7)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--since', type=date.fromisoformat)
    parser.add_argument('--refresh-limit', type=int, default=500, help='Older detail pages to recheck per run; not the entire historical database.')
    parser.add_argument('--max-projects', type=int, help='Testing only: partial discovery never advances the watermark.')
    parser.add_argument('--workers', type=int, choices=range(1, 5), default=4)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.refresh_limit < 0 or (args.max_projects is not None and args.max_projects < 1):
        parser.error('Limits must be nonnegative; max-projects must be positive.')
    connection = os.environ.get('DATABASE_URL')
    if not connection:
        raise SyncError('Set DATABASE_URL before running the updater.')
    http = Http()
    db = Database(http, connection)
    today = datetime.now(ZoneInfo('America/Chicago')).date()
    run_id = str(uuid.uuid4())
    inserted = updated = failed = 0
    checkpoint = retry_from = None
    if not args.dry_run:
        db.query('CREATE TABLE IF NOT EXISTS public.tabs_sync_state (name text PRIMARY KEY, discovery_through date, retry_from date, lease_token text, lease_until timestamptz)')
        db.query("INSERT INTO public.tabs_sync_state (name) VALUES ('daily') ON CONFLICT DO NOTHING")
        lease = db.query("UPDATE public.tabs_sync_state SET lease_token=$1, lease_until=now()+interval '3 hours' WHERE name='daily' AND (lease_until IS NULL OR lease_until<now()) RETURNING discovery_through,retry_from", [run_id])
        if not lease:
            raise SyncError('Another sync is already running; retry after it finishes.')
        checkpoint = lease[0]['discovery_through']
        retry_from = lease[0]['retry_from']
    try:
        if not args.dry_run:
            db.query('CREATE TABLE IF NOT EXISTS public.tabs_sync_runs (id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL, discovery_from date, discovery_through date, discovered integer DEFAULT 0, inserted integer DEFAULT 0, updated integer DEFAULT 0, failed integer DEFAULT 0)')
        latest = db.query('SELECT max(registration_date)::text AS latest FROM public.projects')[0]['latest']
        begin = args.since or discovery_start(checkpoint, latest, today)
        if retry_from:
            begin = min(begin, date.fromisoformat(retry_from))
        if begin > today:
            raise SyncError('Start date is in the future.')
        if not args.dry_run:
            # Persist the lower bound BEFORE any inserts; a failed first catch-up must
            # not use a newly inserted maximum date and accidentally skip the gap.
            db.query("UPDATE public.tabs_sync_state SET retry_from=LEAST(COALESCE(retry_from,$1::date),$1::date) WHERE name='daily' AND lease_token=$2", [begin.isoformat(), run_id])
            db.query("INSERT INTO public.tabs_sync_runs (id,status,discovery_from,discovery_through) VALUES ($1,'running',$2,$3)", [run_id, begin.isoformat(), today.isoformat()])
        print(f'Searching TABS registrations {begin} through {today}.', flush=True)
        discovered = list(search(http, begin, today))
        print(f'Found {len(discovered)} registrations in discovery window.', flush=True)
        if args.max_projects:
            discovered = discovered[:args.max_projects]
        known = {r['project_number'] for r in db.query('SELECT project_number FROM public.projects')}
        # Existing overlap rows are also refreshed, including late edits.
        work = {i['ProjectNumber']: i for i in discovered}
        if args.refresh_limit:
            # Rotate older pages fairly. 80% active/recent; 20% historical, no starvation.
            active = "(completion_date IS NULL OR completion_date >= CURRENT_DATE - 180) AND COALESCE(current_status,'') NOT IN ('Project Closed','Inspection Completed')"
            for condition, limit in ((active, args.refresh_limit * 4 // 5), ('NOT (' + active + ')', args.refresh_limit - args.refresh_limit * 4 // 5)):
                for row in db.query(f'SELECT project_number FROM public.projects WHERE {condition} ORDER BY fetched_at ASC, project_number ASC LIMIT $1', [limit]):
                    work.setdefault(row['project_number'], {'ProjectNumber': row['project_number']})
        print(f'Checking {len(work)} detail pages ({sum(k not in known for k in work)} missing from database).', flush=True)
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(enrich, http, item): key for key, item in work.items()}
            for completed, future in enumerate(as_completed(futures), 1):
                key = futures[future]
                try:
                    row = future.result()
                    is_new = key not in known if args.dry_run else db.upsert(row)
                    inserted += int(is_new)
                    updated += int(not is_new)
                except Exception as error:
                    failed += 1
                    message = str(error) if isinstance(error, SyncError) else 'Unexpected parser/database error.'
                    print(f'Failed {key}: {message}', flush=True)
                if completed % 50 == 0 or completed == len(work):
                    print(f'Progress {completed}/{len(work)}: {inserted} added, {updated} refreshed, {failed} failed.', flush=True)
                    if not args.dry_run:
                        db.query("UPDATE public.tabs_sync_state SET lease_until=now()+interval '3 hours' WHERE name='daily' AND lease_token=$1", [run_id])
        if not args.dry_run:
            if failed == 0 and args.max_projects is None:
                db.query("UPDATE public.tabs_sync_state SET discovery_through=GREATEST(COALESCE(discovery_through,$1::date),$1::date),retry_from=NULL WHERE name='daily' AND lease_token=$2", [today.isoformat(), run_id])
            status = 'failed' if failed else ('partial' if args.max_projects else 'success')
            db.query('UPDATE public.tabs_sync_runs SET finished_at=now(),status=$2,discovered=$3,inserted=$4,updated=$5,failed=$6 WHERE id=$1', [run_id,status,len(discovered),inserted,updated,failed])
        print(f'{"DRY RUN: " if args.dry_run else ""}{inserted} added, {updated} refreshed, {failed} failed.', flush=True)
        if failed:
            raise SyncError('Some projects failed; discovery checkpoint was not advanced.')
    except BaseException:
        if not args.dry_run:
            try:
                db.query("UPDATE public.tabs_sync_runs SET finished_at=now(),status='failed',inserted=$2,updated=$3,failed=GREATEST(1,$4) WHERE id=$1", [run_id,inserted,updated,failed])
            except Exception:
                pass
        raise
    finally:
        if not args.dry_run:
            db.query("UPDATE public.tabs_sync_state SET lease_token=NULL,lease_until=NULL WHERE name='daily' AND lease_token=$1", [run_id])


if __name__ == '__main__':
    try:
        main()
    except SyncError as error:
        print(f'Sync failed: {error}', file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        sys.exit(130)
    except Exception:
        print('Sync failed unexpectedly. Credentials and response bodies are omitted.', file=sys.stderr)
        sys.exit(1)
