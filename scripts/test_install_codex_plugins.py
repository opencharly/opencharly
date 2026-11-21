"""Exercise catalog selection and inventory failure in the Codex installer."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).with_name('install-codex-plugins.py')
spec = importlib.util.spec_from_file_location('installer', path)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTest(unittest.TestCase):
    def test_installs_defaults_and_rejects_incomplete_inventory(self):
        catalog = {'name': 'charly-plugins', 'plugins': [
            {'name': 'alpha', 'policy': {'installation': 'INSTALLED_BY_DEFAULT'}},
            {'name': 'beta', 'policy': {'installation': 'AVAILABLE'}},
        ]}
        responses = [
            json.dumps({'marketplaces': []}),
            json.dumps({'installed': [{'pluginId': 'alpha@charly-plugins', 'installed': True, 'enabled': False}]}),
        ]
        with patch.object(Path, 'read_text', return_value=json.dumps(catalog)), \
             patch.object(installer.subprocess, 'check_output', side_effect=responses), \
             patch.object(installer.subprocess, 'run') as run:
            with self.assertRaisesRegex(SystemExit, 'alpha@charly-plugins'):
                installer.main()
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ['codex', 'plugin', 'marketplace', 'add', 'opencharly/marketplace'],
            ['codex', 'plugin', 'add', 'alpha@charly-plugins'],
        ])


if __name__ == '__main__':
    unittest.main()
