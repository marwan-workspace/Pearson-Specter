"""python -m unittest discover tests"""
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path

import llm  # noqa: F401  (loads GEMINI_API_KEY from .env for the live test)
from overview import agent

ROOT = Path(__file__).parent.parent
EXAMPLES = ROOT / "overview" / "examples"
DAY = json.loads((EXAMPLES / "day.json").read_text())
WEEK = json.loads((EXAMPLES / "week.json").read_text())
CHECKIN = json.loads((EXAMPLES / "checkin.json").read_text())


def says(reply):
    return lambda prompt, schema: json.dumps(reply)


ASSESSMENT = {"problem": "Poor sleep", "confidence": 1.7, "urgency": "routine",
              "factors": [{"source": "Sleep", "finding": "4.6 h", "weight": 1}],
              "plan": [{"kind": "sleep", "text": "Fixed sleep window", "urgent": False},
                       {"kind": "exercise", "text": "Rest today", "urgent": True},
                       {"kind": "medication", "text": "Start lorazepam nightly", "urgent": True}]}
CHECKIN_REPLY = {"reply": "Thanks.", "sleepHours": 6, "sleepRating": 3, "symptoms": "headache",
                 "yesterdaySleepHours": -1, "yesterdaySymptoms": "", "mentalAnswers": [4, 3, 2, 3, 4]}


class OverviewTest(unittest.TestCase):
    def test_urgent_items_skip_approval_and_the_rest_wait_for_mission_command(self):
        out = agent.assess(DAY, says(ASSESSMENT))
        self.assertEqual([p["approval"] for p in out["plan"][:3]],
                         ["pending-team-leader", "not-required", "pending-team-leader"])
        self.assertEqual(out["rootCause"]["confidence"], 1)

    def test_low_mental_score_always_gets_therapy(self):
        out = agent.assess(DAY, says(ASSESSMENT))  # DAY has mental score 45, the fake plan has no therapy
        self.assertEqual(out["plan"][-1]["kind"], "therapy")
        healthy = agent.assess({**DAY, "mental": {"score": 85}}, says(ASSESSMENT))
        self.assertNotIn("therapy", [p["kind"] for p in healthy["plan"]])

    def test_tier_1_watch_event_is_never_a_routine_day(self):
        day = {**DAY, "watchEvents": [{"condition": "shock", "tier": 1}]}
        self.assertEqual(agent.assess(day, says(ASSESSMENT))["urgency"], "urgent")
        self.assertEqual(agent.assess(DAY, says(ASSESSMENT))["urgency"], "routine")

    def test_checkin_scores_mental_health_like_the_frontend(self):
        out = agent.checkin(CHECKIN, says(CHECKIN_REPLY))
        self.assertTrue(out["completed"])
        self.assertEqual(out["mental"]["score"], 80)  # (4+3+2+3+4) / 20

    def test_checkin_stays_open_until_every_answer_is_valid(self):
        for change in ({"mentalAnswers": [4, 3, -1, 3, 4]}, {"mentalAnswers": [4, 3, 9, 3, 4]},
                       {"sleepRating": -1}, {"symptoms": ""}, {"mentalAnswers": [4, 3]}):
            out = agent.checkin(CHECKIN, says({**CHECKIN_REPLY, **change}))
            self.assertFalse(out["completed"], change)

    def test_missed_day_must_be_covered_too(self):
        missed = {**CHECKIN, "missedYesterday": True}
        self.assertFalse(agent.checkin(missed, says(CHECKIN_REPLY))["completed"])
        done = {**CHECKIN_REPLY, "yesterdaySleepHours": 5, "yesterdaySymptoms": "none"}
        self.assertTrue(agent.checkin(missed, says(done))["completed"])

    def test_weekly_report_covers_exactly_the_crew_it_was_given(self):
        reply = {"summaries": [{"astronautId": "elena", "summary": "Fine."},
                               {"astronautId": "nobody", "summary": "Invented."}], "flagged": ["Kwame: mood"]}
        out = agent.weekly_report(WEEK, says(reply))
        self.assertEqual(list(out["summary"]), ["elena", "kwame"])
        self.assertIn("No summary", out["summary"]["kwame"])

    def test_emergency_report_needs_no_llm(self):
        decision = {"condition": "shock", "action": "auto_inject", "medication": "epinephrine", "explanation": "BP 62."}
        out = agent.emergency_report({"astronautId": "maya", "decision": decision})
        self.assertEqual((out["kind"], out["flagged"]), ("emergency", ["shock"]))

    def test_command_line_speaks_json_both_ways(self):
        def run(command, data):
            r = subprocess.run([sys.executable, "-m", "overview", command], input=json.dumps(data),
                               capture_output=True, text=True, cwd=ROOT)
            return r.returncode, json.loads(r.stdout)
        decision = {"condition": "shock", "action": "auto_inject", "medication": "epinephrine", "explanation": "BP 62."}
        code, out = run("emergency", {"astronautId": "maya", "decision": decision})
        self.assertEqual((code, out["kind"]), (0, "emergency"))
        code, out = run("emergency", {"astronautId": "maya"})
        self.assertEqual(code, 1)
        self.assertIn("missing: decision", out["error"])

    @unittest.skipUnless(os.environ.get("GEMINI_API_KEY"), "needs GEMINI_API_KEY")
    def test_real_gemini_assessment(self):
        out = agent.assess(DAY)
        self.assertTrue(out["rootCause"]["problem"] and out["plan"])
        self.assertIn("therapy", [p["kind"] for p in out["plan"]])


if __name__ == "__main__":
    unittest.main()
