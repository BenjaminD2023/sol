import contextlib
import importlib.machinery
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import sys
sys.dont_write_bytecode = True
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

path = Path(__file__).resolve().parents[2] / "scripts/local/sol"
loader = importlib.machinery.SourceFileLoader("sol_cli", str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
cli = importlib.util.module_from_spec(spec)
loader.exec_module(cli)


class LocalSolTests(unittest.TestCase):
    def test_capture_opens_only_local_preview_and_preserves_symbols(self):
        with patch.object(cli.subprocess, "run") as run:
            cli.main(["C++ homework A&B=1+2 tomorrow 10AM"])
        args = run.call_args.args[0]
        self.assertEqual(args[:3], ["/usr/bin/open", "-a", "/Applications/Sol.app"])
        parsed = urlparse(args[3])
        self.assertEqual(parsed.scheme, "sol-benjamin")
        self.assertEqual(parsed.netloc, "command")
        self.assertEqual(parse_qs(parsed.query)["text"], ["C++ homework A&B=1+2 tomorrow 10AM"])
        self.assertIn("%20", parsed.query)
        self.assertIn("C%2B%2B", parsed.query)

    def test_tasks_print_active_fixture_without_bridge_token_or_escape_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            snapshot = Path(directory) / "Library/Application Support/StudentHub/Integrations/sol.json"
            snapshot.parent.mkdir(parents=True)
            snapshot.write_text(json.dumps({"schemaVersion": 1, "bridgeToken": "secret-fixture-token", "tasks": [
                {"title": "Fixture\u001b task", "isCompleted": False, "course": "Math", "dueDate": "2026-11-12"},
                {"title": "Completed fixture", "isCompleted": True},
            ]}))
            output = io.StringIO()
            with patch.object(cli.Path, "home", return_value=Path(directory)), contextlib.redirect_stdout(output):
                cli.main(["--tasks"])
            self.assertIn("Fixture task", output.getvalue())
            self.assertNotIn("secret-fixture-token", output.getvalue())
            self.assertNotIn("Completed fixture", output.getvalue())
            self.assertNotIn("\u001b", output.getvalue())

    def test_invalid_commands_do_not_launch(self):
        with patch.object(cli.subprocess, "run") as run:
            for command in ["  ", "a" * 10001, "😀" * 5001, "a\0b"]:
                with self.assertRaises(SystemExit):
                    cli.main([command])
        run.assert_not_called()

    def test_help_and_unknown_options_do_not_launch(self):
        with patch.object(cli.subprocess, "run") as run, contextlib.redirect_stdout(io.StringIO()):
            cli.main(["--help"])
            with self.assertRaises(SystemExit):
                cli.main(["--unknown"])
        run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
