"""LLM half of the watch: Gemini picks the condition; the response for it comes from rules.json."""
import json
import time
from pathlib import Path

import llm

RULES = json.loads((Path(__file__).parent / "rules.json").read_text())
BY_NAME = {c["name"]: c for c in RULES["conditions"]}
NONE = {"tier": 0, "first_response": "", "medication": ""}
# flags the LLM is not allowed to answer "none" to
MUST_ACT = {c["flag"] for c in RULES["conditions"] if c["tier"] == 1} | {"sensor_fault"}

SCHEMA = {
    "type": "object",
    "properties": {"condition": {"type": "string", "enum": [*BY_NAME, "none"]},
                   "explanation": {"type": "string"}},
    "required": ["condition", "explanation"]}


def ask_gemini(prompt):
    return llm.ask(prompt, SCHEMA, timeout_s=8)  # an emergency must not wait on the network


def fallback(state, flags):
    """The rules alone, most severe first."""
    for c in RULES["conditions"]:
        if c["flag"] in flags and state in c.get("states", [state]):
            return c["name"]
    return "none"


def decide(reading, state, flags, baselines, last_dose, ask=ask_gemini, now=None):
    """last_dose: one dict per astronaut, kept by the caller, of condition -> time of its last automatic injection."""
    if not flags:  # nothing abnormal: the only possible answer is none, so do not call the LLM
        return {"condition": "none", "tier": 0, "action": "none", "first_response": "", "medication": "",
                "explanation": "No flag raised.", "source": "rules"}
    limits = {k: baselines[k] for k in ("rest_hr_high", "radiation_high")}
    prompt = (
        "You are the decision step of an astronaut's medical watch. Choose the one condition "
        "the astronaut has right now, or 'none'. A condition is only possible if its flag is "
        "raised. 'states' on a rule is the activity it normally applies to; the activity label "
        "comes from a classifier and can be wrong, so weigh it against the vitals. A high heart "
        "rate during exercise is normal. Explain in two sentences.\n"
        f"Rules: {json.dumps(RULES['conditions'])}\n"
        f"Limits from data: {json.dumps(limits)}\n"
        f"Vitals (last 60 s): {json.dumps(reading)}\n"
        f"Activity: {state}\nFlags raised: {flags}"
    )
    source = "llm"
    try:
        out = json.loads(ask(prompt))
        name, why = out["condition"], out["explanation"]
        if name != "none" and BY_NAME[name]["flag"] not in flags:
            raise ValueError(f"LLM chose {name} but its flag is not raised")
        if name == "none" and MUST_ACT & set(flags):
            raise ValueError("LLM chose none while an emergency flag is raised")
    except Exception as e:  # any LLM failure must still produce a response, so the rules take over
        name, source = fallback(state, flags), "fallback"
        why = f"LLM unavailable or rejected ({e}); rules applied directly."
    rule = BY_NAME.get(name, NONE)
    action = RULES["tiers"].get(str(rule["tier"]), "none")
    if action == "auto_inject":
        now = time.time() if now is None else now
        minutes = (now - last_dose.get(name, float("-inf"))) / 60
        if minutes < RULES["lockout_minutes"]:
            action = "alert_crewmate"
            why += f" No second injection: one was given {minutes:.0f} min ago."
        else:
            # shortcut: assumes the injection happens; record it on delivery once the cancel window exists
            last_dose[name] = now
    return {
        "condition": name,
        "tier": rule["tier"],
        "action": action,
        "first_response": rule["first_response"],
        "medication": rule["medication"],
        "explanation": why,
        "source": source,
    }
