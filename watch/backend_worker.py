"""One JSON request in, one watch decision JSON object out for the JavaScript service."""
import json
import sys

from watch.detect import classify, flags, load
from watch.decide import RULES, decide


def main():
    request = json.load(sys.stdin)
    model, baselines = load()
    reading = request["reading"]
    state = classify(model, reading)
    raised = flags(reading, baselines, RULES["thresholds"])
    result = decide(reading, state, raised, baselines, request.get("lastDose", {}))
    print(json.dumps({"state": state, "flags": raised, "decision": result}))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": f"{type(error).__name__}: {error}"}))
        sys.exit(1)
