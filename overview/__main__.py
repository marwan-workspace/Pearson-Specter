"""python -m overview <command> < input.json   ->   one JSON object on stdout.

Exit code 0 with the result, or 1 with {"error": "..."}.
"""
import json
import sys

from overview import agent

COMMANDS = {"assess": agent.assess, "checkin": agent.checkin, "chat": agent.chat,
            "weekly": agent.weekly_report, "emergency": agent.emergency_report}


def main(argv):
    if len(argv) != 2 or argv[1] not in COMMANDS:
        print(f"usage: python -m overview <{'|'.join(COMMANDS)}> < input.json", file=sys.stderr)
        return 2
    sys.stdin.reconfigure(encoding="utf-8")
    try:
        out = COMMANDS[argv[1]](json.load(sys.stdin))
    except Exception as e:  # the JavaScript caller needs JSON back whatever went wrong
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
        return 1
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
