"""
AI Provider abstraction — routes LLM calls to Cloud (Claude API) or Local (LM Studio).
Provider is selected via hercules_ai_config.ai_provider ('cloud' or 'local').
"""

import logging
import requests

logger = logging.getLogger(__name__)


def _get_anthropic():
    """Lazy import — picks up package even if installed after app start."""
    try:
        import anthropic
        return anthropic
    except ImportError:
        return None


def _get_openai():
    """Lazy import — picks up package even if installed after app start."""
    try:
        import openai
        return openai
    except ImportError:
        return None


# ── Cloud model options ──────────────────────────────────────────────────────
CLOUD_MODELS = {
    'claude-opus-4-6':   {'label': 'Claude Opus 4.6',   'cost_per_year': '$109'},
    'claude-sonnet-4-6': {'label': 'Claude Sonnet 4.6', 'cost_per_year': '$22'},
    'claude-haiku-4-5-20251001': {'label': 'Claude Haiku 4.5', 'cost_per_year': '$7'},
}


def generate(prompt, config, timeout=None, max_tokens=None, system=None):
    """Generate text from the configured AI provider.

    Args:
        prompt: User message text
        config: AI config dict with provider, model, API key etc.
        timeout: Request timeout in seconds
        max_tokens: Maximum output tokens
        system: Optional system message (used by Anthropic's system parameter)
    Returns text string or None on failure.
    """
    provider = config.get('ai_provider', 'cloud')
    if provider == 'local':
        # Local providers don't support system param — concatenate
        full_prompt = f"{system}\n\n{prompt}" if system else prompt
        return _generate_local(full_prompt, config, timeout or 30, max_tokens=max_tokens)
    else:
        return _generate_cloud(prompt, config, timeout or 10, max_tokens=max_tokens, system=system)


def _generate_cloud(prompt, config, timeout, max_tokens=None, system=None):
    """Call Claude API."""
    anthropic = _get_anthropic()
    if not anthropic:
        logger.error("anthropic package not installed")
        return None
    api_key = config.get('llm_api_key', '')
    if not api_key:
        logger.warning("No Claude API key configured")
        return None
    model = config.get('llm_model', 'claude-opus-4-6')
    try:
        client = anthropic.Anthropic(api_key=api_key, timeout=timeout)
        kwargs = {
            'model': model,
            'max_tokens': max_tokens or 700,
            'messages': [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs['system'] = system
        response = client.messages.create(**kwargs)
        return response.content[0].text
    except Exception as e:
        logger.warning("Claude API call failed: %s", e)
        return None


def _detect_loaded_model(base_url):
    """Query LM Studio's /v1/models and return the first non-embedding model id.

    Used when local_model is not pinned in config — lets users swap models in
    LM Studio without having to update Hercules config or click Test Connection.
    Returns None if no chat model is loaded or the server is unreachable.
    """
    try:
        resp = requests.get(f"{base_url}/models", timeout=5)
        resp.raise_for_status()
        for m in resp.json().get("data", []):
            mid = m.get("id", "")
            if mid and not mid.startswith("text-embedding"):
                return mid
    except Exception as e:
        logger.warning("Could not auto-detect loaded model: %s", e)
    return None


def _generate_local(prompt, config, timeout, max_tokens=None):
    """Call LM Studio (OpenAI-compatible API).

    Always queries /v1/models at call time and uses whatever is currently
    loaded — users can swap models in LM Studio with no Hercules-side action.
    """
    base_url = config.get('local_server_url', 'http://localhost:1234/v1')
    model = _detect_loaded_model(base_url) or "local-model"

    # Try openai package first (cleaner)
    openai = _get_openai()
    if openai:
        try:
            client = openai.OpenAI(base_url=base_url, api_key="not-needed", timeout=timeout)
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=max_tokens or 700
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.warning("Local LM Studio call failed (openai): %s", e)
            return None

    # Fallback to raw requests
    try:
        resp = requests.post(
            f"{base_url}/chat/completions",
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens or 700,
            },
            timeout=timeout
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Local LM Studio call failed (requests): %s", e)
        return None


def test_connection(config):
    """Test AI provider connectivity. Returns {ok, message, model}."""
    provider = config.get('ai_provider', 'cloud')

    if provider == 'local':
        base_url = config.get('local_server_url', 'http://localhost:1234/v1')
        try:
            resp = requests.get(f"{base_url}/models", timeout=5)
            resp.raise_for_status()
            models = resp.json().get("data", [])
            if models:
                return {"ok": True, "message": "Connected to LM Studio", "model": models[0].get("id", "unknown")}
            return {"ok": True, "message": "Connected but no model loaded", "model": None}
        except requests.ConnectionError:
            return {"ok": False, "message": "Cannot reach LM Studio. Is it running?", "model": None}
        except Exception as e:
            return {"ok": False, "message": str(e), "model": None}
    else:
        api_key = config.get('llm_api_key', '')
        if not api_key:
            return {"ok": False, "message": "No API key configured", "model": None}
        anthropic = _get_anthropic()
        if not anthropic:
            return {"ok": False, "message": "anthropic package not installed", "model": None}
        try:
            client = anthropic.Anthropic(api_key=api_key, timeout=10)
            model = config.get('llm_model', 'claude-opus-4-6')
            client.messages.create(
                model=model, max_tokens=10,
                messages=[{"role": "user", "content": "Say OK"}]
            )
            return {"ok": True, "message": "Connected to Claude API", "model": model}
        except Exception as e:
            msg = str(e)
            if 'authentication' in msg.lower() or '401' in msg:
                return {"ok": False, "message": "Invalid API key", "model": None}
            return {"ok": False, "message": msg, "model": None}
