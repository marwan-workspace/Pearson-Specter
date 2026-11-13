"""The one Gemini call, shared by the watch and the manager agent."""
import os
from pathlib import Path

# the key lives in the repo's git-ignored .env; a real environment variable wins
_env = Path(__file__).parent / ".env"
for _line in _env.read_text().splitlines() if _env.exists() else []:
    _key, _sep, _value = _line.partition("=")
    if _sep and not _key.lstrip().startswith("#"):
        os.environ.setdefault(_key.strip(), _value.strip().strip("\"'"))


def ask(prompt, schema, timeout_s=30):
    """Send a prompt, get back JSON text that follows `schema`."""
    from google import genai  # reads GEMINI_API_KEY from the environment

    # keep a reference: a temporary client is closed before the request is sent
    client = genai.Client(http_options={"timeout": timeout_s * 1000})
    reply = client.interactions.create(
        model=os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen"),
        input=prompt,
        response_format={"type": "text", "mime_type": "application/json", "schema": schema},
    )
    return reply.output_text
