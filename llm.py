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
    """Send a prompt, get back JSON text that follows `schema`.

    If the main model is out of quota (HTTP 429), retry once with GEMINI_FALLBACK_MODEL when it is set.
    """
    from google import genai  # reads GEMINI_API_KEY from the environment

    models = [os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen"), os.environ.get("GEMINI_FALLBACK_MODEL")]
    models = [m for m in models if m]
    # keep a reference: a temporary client is closed before the request is sent
    client = genai.Client(http_options={"timeout": timeout_s * 1000})
    for i, model in enumerate(models):
        try:
            reply = client.interactions.create(
                model=model,
                input=prompt,
                response_format={"type": "text", "mime_type": "application/json", "schema": schema},
            )
            return reply.output_text
        except Exception as e:
            # only a quota error is worth another model; anything else would fail there too
            if getattr(e, "code", None) != 429 or i == len(models) - 1:
                raise
