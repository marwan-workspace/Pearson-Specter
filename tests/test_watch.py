"""python -m unittest discover tests   (RUN_LIVE_TESTS=1 also runs the Gemini tests)"""
import json
import os
import re
import unittest
from pathlib import Path

from watch.decide import RULES, decide, fallback
from watch.demo import CALM, SCENARIOS
from watch.detect import classify, flags, load

MODEL, BASE = load()


def run(change, reply=None, last_dose=None, now=None):
    reading = {**CALM, **change}
    state = classify(MODEL, reading)
    raised = flags(reading, BASE, RULES["thresholds"])
    ask = (lambda prompt: json.dumps(reply)) if reply else (lambda prompt: 1 / 0)
    return state, raised, decide(reading, state, raised, BASE, {} if last_dose is None else last_dose, ask=ask, now=now)


class WatchTest(unittest.TestCase):
    def test_calm_reading_raises_nothing(self):
        _, raised, d = run({})
        self.assertEqual((raised, d["condition"], d["action"]), ([], "none", "none"))

    def test_exercise_is_not_an_emergency(self):
        state, raised, d = run(SCENARIOS["hard exercise"])
        self.assertEqual((state, raised, d["condition"]), ("exercise", ["hr_high"], "none"))

    def test_high_heart_rate_depends_on_activity(self):
        self.assertEqual(fallback("rest", ["hr_high"]), "tachycardia")
        self.assertEqual(fallback("stress", ["hr_high"]), "panic_attack")

    def test_llm_choice_gets_its_response_from_the_rules(self):
        _, _, d = run({"hr_mean": 36}, {"condition": "bradycardia", "explanation": "slow"})
        self.assertEqual((d["source"], d["tier"], d["action"]), ("llm", 1, "auto_inject"))
        self.assertIn("atropine", d["medication"])

    def test_llm_cannot_inject_without_a_flag(self):
        _, _, d = run(SCENARIOS["hard exercise"], {"condition": "bradycardia", "explanation": "made up"})
        self.assertEqual((d["source"], d["condition"], d["action"]), ("fallback", "none", "none"))

    def test_llm_down_still_treats_the_most_severe_flag(self):
        _, _, d = run(SCENARIOS["shock"])
        self.assertEqual((d["source"], d["condition"], d["action"]), ("fallback", "shock", "auto_inject"))

    def test_llm_cannot_dismiss_an_emergency_flag(self):
        _, _, d = run(SCENARIOS["shock"], {"condition": "none", "explanation": "looks fine"})
        self.assertEqual((d["source"], d["condition"], d["action"]), ("fallback", "shock", "auto_inject"))

    def test_second_injection_is_blocked_until_the_lockout_ends(self):
        doses = {}
        actions = [run({"hr_mean": 36}, last_dose=doses, now=t * 60)[2]["action"] for t in (0, 1, 29, 30)]
        self.assertEqual(actions, ["auto_inject", "alert_crewmate", "alert_crewmate", "auto_inject"])

    def test_radiation_alerts_but_does_not_inject(self):
        _, _, d = run(SCENARIOS["solar storm"])
        self.assertEqual((d["condition"], d["action"]), ("radiation_sickness", "alert_crewmate"))

    def test_broken_or_missing_sensor_is_a_fault_not_healthy(self):
        for change in ({"hr_mean": float("nan")}, {"bp_sys": None}, {"temp": None}, {"location": "europa"}):
            state, raised, d = run(change, {"condition": "none", "explanation": "fine"})
            self.assertEqual((raised, d["condition"], d["action"]), (["sensor_fault"], "sensor_fault", "alert_crewmate"))
        self.assertEqual(run({"hr_mean": float("nan")})[0], "unknown")
        self.assertEqual(run({"location": "ISS"})[1], [])

    def test_low_oxygen_alerts(self):
        _, raised, d = run({"spo2": 82})
        self.assertEqual((raised, d["condition"], d["action"]), (["spo2_low"], "low_oxygen", "alert_crewmate"))

    def test_fever_alerts(self):
        _, raised, d = run({"temp": 38.9})
        self.assertEqual((raised, d["condition"], d["action"]), (["temp_high"], "fever", "alert_crewmate"))

    def test_every_drug_rule_names_a_stocked_medication(self):
        # backend/server.js proposes the first medications-table name found in the rule's text
        schema = (Path(__file__).parent.parent / "database" / "schema.sql").read_text(encoding="utf-8")
        stocked = re.findall(r"^ \('([a-z ]+)','(?:injection|iv|oral|other)'", schema, re.M)
        self.assertIn("lorazepam", stocked)
        for c in RULES["conditions"]:
            if c["medication"] and c["name"] not in ("low_oxygen", "sensor_fault"):
                self.assertTrue(any(name in c["medication"].lower() for name in stocked), c["name"])

    def test_no_flag_means_no_llm_call(self):
        self.assertEqual(run({})[2]["source"], "rules")

    @unittest.skipUnless(os.environ.get("RUN_LIVE_TESTS") == "1", "set RUN_LIVE_TESTS=1 to call Gemini (uses quota)")
    def test_real_gemini_call(self):
        d = decide({**CALM, "hr_mean": 36}, "rest", ["hr_low"], BASE, {})
        self.assertEqual((d["source"], d["condition"]), ("llm", "bradycardia"), d["explanation"])


if __name__ == "__main__":
    unittest.main()
