import importlib.util
from datetime import date
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('sync_tabs', Path(__file__).parents[1] / 'scripts/sync_tabs.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def fixture():
    sections = '''<div class="project-details-header">Project #: TABS2027000001 Registration Date: 10/15/2026</div>
    <div class="project-details-project"><dl>
    <dt>Project Name:</dt><dd>Example &amp; Sons</dd>
    <dt>Project Number:</dt><dd>TABS2027000001</dd>
    <dt>Location Address:</dt><dd>100 Example St<br>Suite 2</dd><dd>Bryan, TX 77802</dd>
    <dt>Location County:</dt><dd>Brazos</dd>
    <dt>Start Date:</dt><dd>11/1/2026</dd><dt>Completion Date:</dt><dd>1/15/2027</dd>
    <dt>Estimated Cost:</dt><dd>$123,456.50</dd><dt>Square Footage:</dt><dd>2,349 ft <sup>2</sup></dd>
    <dt>Scope of Work:</dt><dd>Tenant <strong>improvements</strong>.</dd>
    <dt>Current Status:</dt><dd>Project Registered</dd></dl></div>'''
    sections += '<div class="project-details-contact"><dl><dt>Contact Name:</dt><dd>Example Person</dd></dl></div>'
    for section in ('ras', 'owner', 'tenant', 'designer'):
        sections += f'<div class="project-details-{section}"><p>Not Assigned</p></div>'
    return sections


class ParserTests(unittest.TestCase):
    def test_dates_cost_address_nested_text_and_unassigned_contacts(self):
        row = sync.parse_detail(fixture(), 'TABS2027000001')
        self.assertEqual(row['registration_date'], '2026-10-15')
        self.assertEqual(row['completion_date'], '2027-01-15')
        self.assertEqual(row['estimated_cost'], '123456.50')
        self.assertEqual(row['square_footage'], 2349)
        self.assertEqual(row['project_name'], 'Example & Sons')
        self.assertEqual(row['location_address'], '100 Example St Suite 2')
        self.assertEqual(row['location_city'], 'Bryan')
        self.assertEqual(row['location_zip'], '77802')
        self.assertFalse(row['tenant_assigned'])
        self.assertIsNone(row['tenant_phone'])
        self.assertNotIn('ft', str(row['square_footage']))

    def test_rejects_wrong_identity_error_page_and_truncated_contacts(self):
        for html in ('<html>Service unavailable</html>', fixture().replace('TABS2027000001', 'TABS2027000002'),
                     fixture().replace('project-details-owner', 'unexpected-owner')):
            with self.assertRaises(sync.SyncError):
                sync.parse_detail(html, 'TABS2027000001')

    def test_refuses_invalid_dates_instead_of_erasing_existing_data(self):
        with self.assertRaises(sync.SyncError):
            sync.parse_detail(fixture().replace('1/15/2027', '2/30/2027'), 'TABS2027000001')

    def test_checkpoint_takes_precedence_over_max_registration_after_partial_failure(self):
        self.assertEqual(sync.discovery_start('2026-09-29', '2026-10-15', date(2026, 10, 16)), date(2026, 9, 22))
        self.assertEqual(sync.discovery_start(None, '2026-09-28', date(2026, 10, 16)), date(2026, 9, 21))

    def test_pagination_detects_empty_or_duplicate_pages_before_advancing_checkpoint(self):
        class HTTP:
            def request(self, *args):
                return '{"data":[],"recordsFiltered":100}'
        with self.assertRaises(sync.SyncError):
            list(sync.search(HTTP(), date(2026, 10, 1), date(2026, 10, 2)))

    def test_batch_upsert_binds_source_text_and_preserves_absent_index_metadata(self):
        import json
        row = sync.parse_detail(fixture(), 'TABS2027000001')
        text = "Example'); DROP TABLE projects; --"
        row['project_name'] = text
        row['index_status_code'] = 3008
        calls = []
        class DB(sync.Database):
            def __init__(self):
                pass
            def query(self, sql, params):
                calls.append((sql, params))
                return [{'inserted': True}]
        DB().upsert_many([row])
        sql, params = calls[0]
        self.assertNotIn(text, sql)
        self.assertIn('COALESCE(EXCLUDED.index_status_code, projects.index_status_code)', sql)
        self.assertIn('ON CONFLICT (project_number) DO UPDATE', sql)
        self.assertNotIn('DELETE', sql)
        decoded = json.loads(params[0])
        self.assertEqual(decoded[0]['project_name'], text)
        self.assertIsInstance(decoded[0]['sections'], dict)


if __name__ == '__main__':
    unittest.main()
