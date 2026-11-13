"""python -m unittest discover tests"""
import os
import unittest
from types import SimpleNamespace
from unittest import mock

import llm


class Refused(Exception):
    def __init__(self, code):
        super().__init__(f"{code} refused")
        self.code = code


def fake_client(fail):
    """A Gemini client whose models in `fail` raise their error code; the rest answer with their name."""
    calls = []

    def create(model, **_):
        calls.append(model)
        if model in fail:
            raise Refused(fail[model])
        return SimpleNamespace(output_text=model)

    client = SimpleNamespace(interactions=SimpleNamespace(create=create))
    return mock.patch("google.genai.Client", return_value=client), calls


class FallbackTest(unittest.TestCase):
    def ask(self, env, fail):
        patch, calls = fake_client(fail)
        with patch, mock.patch.dict(os.environ, env):
            if "GEMINI_FALLBACK_MODEL" not in env:
                os.environ.pop("GEMINI_FALLBACK_MODEL", None)
            try:
                return llm.ask("hi", {}), calls
            except Refused as e:
                return e, calls

    def test_quota_error_moves_to_the_fallback_model(self):
        out, calls = self.ask({"GEMINI_MODEL": "main", "GEMINI_FALLBACK_MODEL": "spare"}, {"main": 429})
        self.assertEqual((out, calls), ("spare", ["main", "spare"]))

    def test_other_errors_are_not_retried(self):
        out, calls = self.ask({"GEMINI_MODEL": "main", "GEMINI_FALLBACK_MODEL": "spare"}, {"main": 400})
        self.assertEqual((out.code, calls), (400, ["main"]))

    def test_no_fallback_set_means_the_quota_error_is_raised(self):
        out, calls = self.ask({"GEMINI_MODEL": "main"}, {"main": 429})
        self.assertEqual((out.code, calls), (429, ["main"]))

    def test_fallback_out_of_quota_too_raises(self):
        out, calls = self.ask({"GEMINI_MODEL": "main", "GEMINI_FALLBACK_MODEL": "spare"}, {"main": 429, "spare": 429})
        self.assertEqual((out.code, calls), (429, ["main", "spare"]))


if __name__ == "__main__":
    unittest.main()
