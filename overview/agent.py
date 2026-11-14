"""Manager agent on the dashboard side: daily check-in (5), mental health score (2), root cause (8),
treatment plan (4), any-time chat (9), weekly and emergency reports (6).

Every function takes one JSON-ready dict and returns one.
From JavaScript (backend/server.js):  python -m overview <assess|checkin|chat|weekly|emergency> < input.json
"""
import json
import time

import llm

MH_QUESTIONS = [
    "How would you rate your mood today?",
    "How well are you coping with workload?",
    "How connected do you feel to the crew?",
    "How calm do you feel right now?",
    "How motivated are you about tomorrow?",
]
THERAPY_BELOW = 70
THERAPY_TEXT = "Daily guided session with the agent, results shared with mission command"
URGENCY = ["routine", "urgent", "emergency"]
VOICE = (
    "You are the manager agent of a spacecraft's crew health system. Be brief, plain and kind. "
    "Never give medication doses. What the astronaut reports takes priority over what the watch shows: "
    "if they feel ill and the watch looks normal, look for the reason for the feeling. "
)
STR, NUM, BOOL = {"type": "string"}, {"type": "number"}, {"type": "boolean"}


def _obj(**props):
    return {"type": "object", "properties": props, "required": list(props)}


def _need(data, *keys):
    missing = [k for k in keys if k not in data]
    if missing:
        raise ValueError(f"input is missing: {', '.join(missing)}")


def _now():
    return int(time.time() * 1000)


def _in_range(value, low, high):
    """The LLM marks 'not answered yet' with -1; anything outside the scale counts as not answered too."""
    return value if isinstance(value, (int, float)) and low <= value <= high else None


def assess(day, ask=llm.ask):
    """Features 8 and 4. day: astronautId, date, plus whatever is known: vitals24h, sleep, mental,
    checkIn, watchEvents. Returns rootCause, urgency and plan."""
    _need(day, "astronautId", "date")
    out = json.loads(ask(
        VOICE + "Find the single most likely underlying problem behind this astronaut's last 24 hours, "
        "from the check-in, sleep, mental health and vitals together. List the findings that support it, "
        "with weights that add up to 1. Then write a treatment plan of 1 to 5 items. Mark an item urgent "
        "only if waiting for the on-board decider would risk harm. If nothing is wrong, say so and "
        "keep the plan to monitoring advice.\n"
        f"Data: {json.dumps(day)}",
        _obj(problem=STR, confidence=NUM, urgency={"type": "string", "enum": URGENCY},
             factors={"type": "array", "items": _obj(
                 source={"type": "string", "enum": ["Check-in", "Sleep", "Mental health", "24 h vitals"]},
                 finding=STR, weight=NUM)},
             plan={"type": "array", "items": _obj(
                 kind={"type": "string", "enum": ["medication", "sleep", "therapy", "exercise", "diet"]},
                 text=STR, urgent=BOOL)}),
    ))
    urgency, plan = out["urgency"], out["plan"][:5]
    # a tier 1 watch event in the window is never a routine day, whatever the LLM says. The backend sends
    # condition_events rows, where tier 1 is severity 'critical'; the examples use the watch's own tier field.
    if urgency == "routine" and any(e.get("tier") == 1 or e.get("severity") == "critical" for e in day.get("watchEvents", [])):
        urgency = "urgent"
    score = (day.get("mental") or {}).get("score")
    if score is not None and score < THERAPY_BELOW and not any(p["kind"] == "therapy" for p in plan):
        plan.append({"kind": "therapy", "text": THERAPY_TEXT, "urgent": False})
    return {
        "rootCause": {"date": day["date"], "problem": out["problem"],
                      "confidence": min(1, max(0, out["confidence"])), "factors": out["factors"]},
        "urgency": urgency,
        "plan": [{"id": f"{day['astronautId']}-{day['date']}-{i}", "kind": p["kind"], "text": p["text"],
                  "urgent": p["urgent"],
                  # urgent proceeds with no approval; the rest waits for the on-board decider. Medication from
                  # the LLM always waits: the drug is free text and nothing checks it against a list
                  "approval": "not-required" if p["urgent"] and p["kind"] != "medication"
                  else "pending-team-leader"}
                 for i, p in enumerate(plan)],
    }


def checkin(state, ask=llm.ask):
    """Features 5 and 2. state: astronautId, date, messages [{from, text}], optional missedYesterday.
    Call once per astronaut message (or with no messages to open). Returns the agent's next message,
    the answers collected so far, and `completed`; `mental` is filled once all five questions are scored."""
    _need(state, "astronautId", "date", "messages")
    missed = bool(state.get("missedYesterday"))
    out = json.loads(ask(
        VOICE + "Run the daily check-in, about three minutes. Ask one thing at a time, in this order: "
        + ("yesterday's missed sleep hours and symptoms, then " if missed else "")
        + "hours slept last night, sleep quality from 1 to 5, any symptoms, then these five questions, "
        f"each answered 0 (worst) to 4 (best): {json.dumps(MH_QUESTIONS)}. "
        "Read the conversation, fill in every answer the astronaut has already given, and write your next "
        "message. Use -1 for numbers not answered yet and an empty string for symptoms not asked yet; "
        "write 'none' when they report no symptoms. When everything is answered, thank them and close.\n"
        f"Conversation: {json.dumps(state['messages'])}",
        _obj(reply=STR, sleepHours=NUM, sleepRating=NUM, symptoms=STR, yesterdaySleepHours=NUM,
             yesterdaySymptoms=STR, mentalAnswers={"type": "array", "items": NUM}),
    ))
    mh = [_in_range(a, 0, 4) for a in (out["mentalAnswers"] + [None] * 5)[:5]]
    answers = {
        "sleepHours": _in_range(out["sleepHours"], 0, 24),
        "sleepRating": _in_range(out["sleepRating"], 1, 5),
        "symptoms": out["symptoms"] or None,
        "mentalAnswers": mh,
    }
    if missed:
        answers["yesterdaySleepHours"] = _in_range(out["yesterdaySleepHours"], 0, 24)
        answers["yesterdaySymptoms"] = out["yesterdaySymptoms"] or None
    mental = None
    if None not in mh:
        mental = {"date": state["date"], "score": round(sum(mh) / (4 * len(mh)) * 100),
                  "answers": [{"q": q, "a": a} for q, a in zip(MH_QUESTIONS, mh)],
                  "sentToMissionCommand": True}
    return {
        "message": {"from": "agent", "text": out["reply"], "at": _now()},
        "answers": answers,
        "completed": mental is not None and None not in answers.values(),
        "mental": mental,
    }


def chat(state, ask=llm.ask):
    """Feature 9. state: astronautId, messages [{from, text}], optional context (assessment, vitals...)."""
    _need(state, "astronautId", "messages")
    out = json.loads(ask(
        VOICE + "The astronaut is talking to you outside the daily check-in. Answer from the data you "
        "have and say so when you do not know. If they describe an emergency, tell them to alert a "
        "crewmate now.\n"
        f"What you know about them: {json.dumps(state.get('context', {}))}\n"
        f"Conversation: {json.dumps(state['messages'])}",
        _obj(reply=STR),
    ))
    return {"message": {"from": "agent", "text": out["reply"], "at": _now()}}


def weekly_report(week, ask=llm.ask):
    """Feature 6. week: periodStart, periodEnd, astronauts [{id, ...the week's data}]."""
    _need(week, "periodStart", "periodEnd", "astronauts")
    ids = [a["id"] for a in week["astronauts"]]
    out = json.loads(ask(
        VOICE + "Write the weekly health report for mission command: three sentences per astronaut on "
        "how their week went, and a separate list of issues mission command must look at. Flag every "
        "mental health concern.\n"
        f"Data: {json.dumps(week)}",
        _obj(summaries={"type": "array", "items": _obj(astronautId=STR, summary=STR)},
             flagged={"type": "array", "items": STR}),
    ))
    written = {s["astronautId"]: s["summary"] for s in out["summaries"]}
    return {
        "kind": "weekly", "createdAt": _now(), "astronautIds": ids,
        "periodStart": week["periodStart"], "periodEnd": week["periodEnd"],
        "summary": {i: written.get(i, "No summary was produced for this astronaut.") for i in ids},
        "flagged": out["flagged"], "rawData": week["astronauts"],
        "delivery": "queued",  # the sender decides when Earth contact allows it to go
    }


def emergency_report(event):
    """Feature 6. event: astronautId, decision (output of watch.decide), optional reading.
    Built without the LLM so an emergency report never waits on it."""
    _need(event, "astronautId", "decision")
    d = event["decision"]
    _need(d, "condition", "action", "medication", "explanation")
    return {
        "kind": "emergency", "createdAt": _now(), "astronautIds": [event["astronautId"]],
        "summary": {event["astronautId"]:
                    f"{d['condition']}: {d['action']}, {d['medication'] or 'no medication'}. {d['explanation']}"},
        "flagged": [d["condition"]],
        "rawData": {"decision": d, "reading": event.get("reading")},
        "delivery": "queued",
    }
