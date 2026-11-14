"""One JSON request for the whole crew in, one watch decision per astronaut out, for the JavaScript service.

stdin:  {"crew": [{"reading": {...}, "lastDose": {...}}, ...]}
stdout: {"results": [{"state": ..., "flags": [...], "decision": {...}}, ...]}   same order as "crew"
"""
import json
import sys

from watch.detect import classify, flags, load
from watch.decide import RULES, decide


def main():
    request = json.load(sys.stdin)
    model, baselines = load()  # once per tick, not once per astronaut
    results = []
    for member in request["crew"]:
        reading = member["reading"]
        state = classify(model, reading)
        raised = flags(reading, baselines, RULES["thresholds"])
        results.append({"state": state, "flags": raised,
                        "decision": decide(reading, state, raised, baselines, member.get("lastDose", {}))})
    print(json.dumps({"results": results}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(1)
