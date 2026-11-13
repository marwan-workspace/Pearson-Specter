"""Run hand-made scenarios through the watch:  python -m watch.demo

Without GEMINI_API_KEY the LLM step fails and the rules answer instead (source = fallback).
"""
from watch.decide import RULES, decide
from watch.detect import classify, flags, load

CALM = {"hr_mean": 70, "hr_std": 1.5, "acc_std": 1.2, "eda_mean": 0.3, "eda_slope": 0.0, "temp_mean": 32.0,
        "bp_sys": 118, "bp_dia": 76, "spo2": 98, "radiation": 1.5, "location": "iss"}
SCENARIOS = {
    "resting, all normal": {},
    "hard exercise": {"hr_mean": 160, "hr_std": 6, "acc_std": 12, "eda_mean": 5, "eda_slope": 0.1},
    "bradycardia": {"hr_mean": 36},
    "solar storm": {"radiation": 900},
    "shock": {"hr_mean": 128, "bp_sys": 62, "bp_dia": 38},
}

if __name__ == "__main__":
    model, baselines = load()
    for title, change in SCENARIOS.items():
        reading = {**CALM, **change}
        state = classify(model, reading)
        raised = flags(reading, baselines, RULES["thresholds"])
        d = decide(reading, state, raised, baselines, last_dose={})
        print(f"\n{title}: activity={state} flags={raised}")
        print(f"  -> {d['condition']} | tier {d['tier']} {d['action']} | {d['medication'] or '-'} | via {d['source']}")
        print(f"     {d['explanation']}")
