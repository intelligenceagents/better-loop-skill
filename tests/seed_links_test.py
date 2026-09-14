"""Regression checks for authored documentation coverage in nested checkouts."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools import validate_context


class AuthoredLinksTest(unittest.TestCase):
    def test_ignored_ancestor_does_not_skip_authored_docs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "artifacts" / "checkout"
            root.mkdir(parents=True)
            (root / "target.txt").write_text("synthetic")
            (root / "README.md").write_text("[Authored link](target.txt)")
            for directory in ("node_modules", ".venv", "dist", "artifacts"):
                (root / directory).mkdir()
                (root / directory / "README.md").write_text("[Dependency link](absent)")
            with patch.object(validate_context, "ROOT", root):
                self.assertEqual(validate_context.check_links(), 1)
                (root / "README.md").write_text("[Broken authored link](absent)")
                with self.assertRaisesRegex(AssertionError, "Broken local link"):
                    validate_context.check_links()


if __name__ == "__main__":
    unittest.main()
