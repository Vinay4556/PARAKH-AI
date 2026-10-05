"""
Tests for the self-hosted translation service.

Run with:  python -m unittest discover -s tests -v
"""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services import translate_service as svc  # noqa: E402


def _fake_response(text):
    resp = mock.Mock()
    resp.json.return_value = {'translatedText': text}
    resp.raise_for_status.return_value = None
    return resp


class TranslateServiceTests(unittest.TestCase):
    def setUp(self):
        # Isolate every test from the real on-disk cache.
        self.tmp = tempfile.TemporaryDirectory()
        self._real_dir = svc.DATA_DIR
        svc.DATA_DIR = self.tmp.name
        svc.invalidate_memory()
        self.addCleanup(self._restore)

    def _restore(self):
        svc.DATA_DIR = self._real_dir
        svc.invalidate_memory()
        self.tmp.cleanup()

    def test_returns_source_text_when_engine_is_down(self):
        with mock.patch.object(svc.requests, 'post', side_effect=RuntimeError('down')):
            self.assertEqual(svc.translate('Dashboard', 'hi', 'en'), 'Dashboard')

    def test_failed_translation_is_not_cached(self):
        """A failure must be retryable later, not frozen into the cache."""
        with mock.patch.object(svc.requests, 'post', side_effect=RuntimeError('down')):
            svc.translate('Dashboard', 'hi', 'en')
        self.assertFalse(os.path.exists(os.path.join(svc.DATA_DIR, svc.CACHE_FILE)))

        with mock.patch.object(svc.requests, 'post', return_value=_fake_response('डैशबोर्ड')):
            self.assertEqual(svc.translate('Dashboard', 'hi', 'en'), 'डैशबोर्ड')

    def test_translation_is_served_from_disk_with_engine_offline(self):
        with mock.patch.object(svc.requests, 'post', return_value=_fake_response('डैशबोर्ड')):
            svc.translate('Dashboard', 'hi', 'en')

        # Simulate a full restart: nothing left in memory, engine unreachable.
        svc.invalidate_memory()
        post = mock.Mock(side_effect=RuntimeError('down'))
        with mock.patch.object(svc.requests, 'post', post):
            self.assertEqual(svc.translate('Dashboard', 'hi', 'en'), 'डैशबोर्ड')
        post.assert_not_called()

    def test_empty_and_identity_translations_skip_the_engine(self):
        post = mock.Mock()
        with mock.patch.object(svc.requests, 'post', post):
            self.assertEqual(svc.translate('', 'hi', 'en'), '')
            self.assertEqual(svc.translate('   ', 'hi', 'en'), '   ')
            self.assertEqual(svc.translate('Dashboard', 'en', 'en'), 'Dashboard')
        post.assert_not_called()

    def test_cache_distinguishes_target_language(self):
        """Hindi and Tamil must not collide in the cache."""
        with mock.patch.object(svc.requests, 'post', return_value=_fake_response('HINDI')):
            self.assertEqual(svc.translate('Documents', 'hi', 'en'), 'HINDI')
        with mock.patch.object(svc.requests, 'post', return_value=_fake_response('TAMIL')):
            self.assertEqual(svc.translate('Documents', 'ta', 'en'), 'TAMIL')
        # ...and both are still individually retrievable afterwards.
        with mock.patch.object(svc.requests, 'post', side_effect=RuntimeError('down')):
            self.assertEqual(svc.translate('Documents', 'hi', 'en'), 'HINDI')
            self.assertEqual(svc.translate('Documents', 'ta', 'en'), 'TAMIL')

    def test_engine_returns_empty_string_falls_back_to_source(self):
        with mock.patch.object(svc.requests, 'post', return_value=_fake_response('   ')):
            self.assertEqual(svc.translate('Dashboard', 'hi', 'en'), 'Dashboard')

    def test_translate_many_preserves_order_and_length(self):
        with mock.patch.object(svc.requests, 'post', side_effect=RuntimeError('down')):
            out = svc.translate_many(['a', '', 'b'], 'hi', 'en')
        self.assertEqual(out, ['a', '', 'b'])

    def test_translate_bundle_keeps_keys_and_nested_dicts(self):
        bundle = svc.translate_bundle(
            {'dashboard': 'Dashboard', 'nested': {'logout': 'Logout'}, 'count': 3},
            'hi',
            'en',
        )
        self.assertEqual(set(bundle), {'dashboard', 'nested', 'count'})
        self.assertEqual(bundle['count'], 3)
        self.assertEqual(set(bundle['nested']), {'logout'})


class TranslateRouteTests(unittest.TestCase):
    def setUp(self):
        from app import app
        app.config['TESTING'] = True
        self.client = app.test_client()

    def test_translate_requires_target(self):
        r = self.client.post('/api/translate', json={'q': 'Dashboard'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('target', r.get_json()['error'])

    def test_translate_passes_through_empty_text(self):
        r = self.client.post('/api/translate', json={'q': '', 'target': 'hi'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['translatedText'], '')

    def test_translate_returns_translation(self):
        with mock.patch.object(svc, 'translate', return_value='डैशबोर्ड') as t:
            r = self.client.post('/api/translate', json={'q': 'Dashboard', 'source': 'en', 'target': 'hi'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['translatedText'], 'डैशबोर्ड')
        t.assert_called_once_with('Dashboard', 'hi', 'en')

    def test_batch_rejects_non_array(self):
        r = self.client.post('/api/translate/batch', json={'q': 'nope', 'target': 'hi'})
        self.assertEqual(r.status_code, 400)

    def test_batch_enforces_size_limit(self):
        r = self.client.post('/api/translate/batch', json={'q': ['x'] * 501, 'target': 'hi'})
        self.assertEqual(r.status_code, 400)
        self.assertIn('500', r.get_json()['error'])

    def test_batch_at_size_limit_is_accepted(self):
        with mock.patch.object(svc, 'translate_many', return_value=['x'] * 500):
            r = self.client.post('/api/translate/batch', json={'q': ['x'] * 500, 'target': 'hi'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.get_json()['translatedTexts']), 500)

    def test_bundle_requires_object(self):
        r = self.client.post('/api/translate/bundle', json={'strings': ['a'], 'target': 'hi'})
        self.assertEqual(r.status_code, 400)

    def test_bundle_returns_translated_bundle(self):
        with mock.patch.object(svc, 'translate_bundle', return_value={'dashboard': 'डैशबोर्ड'}) as b:
            r = self.client.post(
                '/api/translate/bundle',
                json={'strings': {'dashboard': 'Dashboard'}, 'source': 'en', 'target': 'hi'},
            )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()['bundle'], {'dashboard': 'डैशबोर्ड'})
        b.assert_called_once_with({'dashboard': 'Dashboard'}, 'hi', 'en')

    def test_status_advertises_free_and_non_expiring(self):
        with mock.patch.object(svc, 'engine_status', return_value=False):
            r = self.client.get('/api/translate/status')
        body = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertTrue(body['free'])
        self.assertFalse(body['expirable'])
        self.assertFalse(body['api_key_required'])
        self.assertFalse(body['engine_online'])


if __name__ == '__main__':
    unittest.main()
