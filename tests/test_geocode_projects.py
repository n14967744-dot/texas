import importlib.util
import io
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('geocode_projects', Path(__file__).parents[1] / 'scripts/geocode_projects.py')
geo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo)


class GeocodeTests(unittest.TestCase):
    def test_stdlib_multipart_and_census_match_and_no_match(self):
        response = '0,"100 Main St, Bryan, TX",Match,Exact,100 MAIN ST,"-96.35,30.64"\n1,Elsewhere,No_Match\n'
        with patch.object(geo.urllib.request, 'urlopen') as urlopen:
            urlopen.return_value.__enter__.return_value.read.return_value = response.encode()
            result = geo.census_batch([('100 Main St', 'Bryan', '77801'), ('Elsewhere', 'Bryan', '')])
        request = urlopen.call_args.args[0]
        self.assertEqual(request.full_url, geo.CENSUS_BATCH)
        self.assertIn(b'name="benchmark"\r\n\r\nPublic_AR_Current', request.data)
        self.assertIn(b'name="addressFile"; filename="a.csv"', request.data)
        self.assertIn(b'0,100 Main St,Bryan,TX,77801', request.data)
        self.assertEqual(result[0]['lat'], 30.64)
        self.assertNotIn(1, result)

    def test_errors_and_truncated_success_responses_are_retryable_not_no_matches(self):
        for result in (OSError('offline'), geo.http.client.IncompleteRead(b''), geo.csv.Error('invalid CSV'),
                       '', '0,Elsewhere,No_Match\n', '<html>Unavailable</html>', '0,Elsewhere,Match,Exact,ADDRESS,"nan,30"\n'):
            with self.subTest(result=result), patch.object(geo, 'post') as post, patch.object(geo.time, 'sleep'), \
                 patch('sys.stderr', new_callable=io.StringIO):
                if isinstance(result, Exception): post.side_effect = result
                else: post.return_value = result
                with self.assertRaises(RuntimeError):
                    geo.census_batch([('a', 'b', ''), ('c', 'd', '')])
                self.assertEqual(post.call_count, 3)

    def test_incremental_is_bounded_idempotent_and_caches_no_match(self):
        projects = [
            {'project_number': 'new', 'location_address': ' 100 Main ', 'location_city': 'Bryan', 'location_zip': None},
            {'project_number': 'duplicate', 'location_address': '100 Main', 'location_city': 'Bryan', 'location_zip': ''},
            {'project_number': 'changed', 'location_address': '200 Main', 'location_city': 'Bryan', 'location_zip': ''},
        ]
        stored = {'changed': 'OLD ADDRESS'}
        def sql(queries, read_only=False):
            query = queries[0]
            if read_only:
                self.assertIn('g.project_number IS NULL', query['query'])
                self.assertIn('g.input_address <>', query['query'])
                self.assertIn('LIMIT $1', query['query'])
                return [[p for p in projects if stored.get(p['project_number']) != geo.address_key(p)][:query['params'][0]]]
            for row in json.loads(query['params'][0]):
                self.assertEqual(row['precision'], 'none')
                stored[row['project_number']] = row['input_address']
            return [[]]
        with patch.object(geo, 'sql', side_effect=sql), patch.object(geo, 'census_batch', return_value={}) as census, \
             patch('sys.stdout', new_callable=io.StringIO):
            geo.geocode(3000, 500)
            self.assertEqual(len(census.call_args.args[0]), 2)  # deduplicated
            self.assertEqual(len(stored), 3)
            census.reset_mock()
            geo.geocode(3000, 500)
            census.assert_not_called()  # exits normally, including cached no-match rows

    def test_failed_chunk_remains_pending_and_next_chunk_is_written(self):
        projects = [{'project_number': str(i), 'location_address': f'{i} Main', 'location_city': 'Bryan', 'location_zip': ''} for i in range(2)]
        writes = []
        def sql(queries, read_only=False):
            if read_only: return [projects]
            writes.extend(json.loads(queries[0]['params'][0]))
            return [[]]
        with patch.object(geo, 'sql', side_effect=sql), patch.object(geo, 'census_batch', side_effect=[RuntimeError('Census failed'), {}]), \
             patch('sys.stdout', new_callable=io.StringIO), patch('sys.stderr', new_callable=io.StringIO) as errors:
            geo.geocode(3000, 1)
        self.assertEqual([row['project_number'] for row in writes], ['1'])
        self.assertIn('leaving 1 addresses pending', errors.getvalue())


if __name__ == '__main__':
    unittest.main()
