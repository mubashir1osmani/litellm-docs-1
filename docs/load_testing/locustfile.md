# Locust Load Test File

Full `locustfile.py` for load testing the LiteLLM proxy. Covers two user classes:

- **`LiteLLMUser`** — general chat, embeddings, `/health/liveliness`, model listing
- **`ClaudeCodeUser`** — simulates Claude Code agent traffic: tool definitions, multi-turn streaming conversations, non-streaming background calls

## Setup

```bash
pip install locust
```

Set your proxy details via environment variables:

| Variable | Default | Description |
|---|---|---|
| `LITELLM_API_KEY` | `sk-1234567890abcdef` | API key for the proxy |
| `LITELLM_MODEL` | `gpt-3.5-turbo` | Model for general chat tasks |
| `LITELLM_EMBED_MODEL` | `text-embedding-ada-002` | Model for embedding tasks |
| `CLAUDE_CODE_MODEL` | `claude-sonnet-4-6` | Model for Claude Code tasks |

## Run

```bash
LITELLM_API_KEY=sk-your-key locust -f locustfile.py --host=http://localhost:4000
```

Then open **http://localhost:8089** to set user count and spawn rate.

## locustfile.py

```python
"""
LiteLLM Proxy Load Testing with Locust

Usage:
    pip install locust
    locust -f locustfile.py --host=http://localhost:4000

    Open http://localhost:8089 to set user count and spawn rate.

Environment variables:
    LITELLM_API_KEY        API key for the proxy      (default: sk-1234567890abcdef)
    LITELLM_MODEL          Model for general tasks     (default: gpt-3.5-turbo)
    LITELLM_EMBED_MODEL    Model for embeddings        (default: text-embedding-ada-002)
    CLAUDE_CODE_MODEL      Model for Claude Code tasks (default: claude-sonnet-4-6)

User classes:
    LiteLLMUser      General chat, embeddings, liveliness check, model listing
    ClaudeCodeUser   Claude Code agent traffic: tool definitions, multi-turn, streaming
"""

import json
import os
import random

from locust import HttpUser, between, task

LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "sk-1234567890abcdef")
LITELLM_MODEL = os.getenv("LITELLM_MODEL", "gpt-3.5-turbo")
LITELLM_EMBED_MODEL = os.getenv("LITELLM_EMBED_MODEL", "text-embedding-ada-002")
CLAUDE_CODE_MODEL = os.getenv("CLAUDE_CODE_MODEL", "claude-sonnet-4-6")

CHAT_PROMPTS = [
    "What is 2 + 2?",
    "Summarize machine learning in one sentence.",
    "What is the capital of France?",
    "Write a haiku about the ocean.",
    "What is the speed of light?",
]

EMBEDDING_INPUTS = [
    "LiteLLM is an open-source proxy for LLM APIs.",
    "Load testing helps identify performance bottlenecks.",
    "Python is a popular programming language.",
]


def _ok(response):
    return response.status_code in (200, 204)


def _fail_msg(response):
    return f"HTTP {response.status_code}: {response.text[:200]}"


class LiteLLMUser(HttpUser):
    wait_time = between(1, 3)

    def on_start(self):
        self.headers = {
            "Authorization": f"Bearer {LITELLM_API_KEY}",
            "Content-Type": "application/json",
        }

    @task(6)
    def chat_completion(self):
        payload = {
            "model": LITELLM_MODEL,
            "messages": [{"role": "user", "content": random.choice(CHAT_PROMPTS)}],
            "max_tokens": 50,
        }
        with self.client.post(
            "/chat/completions", headers=self.headers, json=payload,
            catch_response=True, name="/chat/completions",
        ) as r:
            r.success() if _ok(r) else r.failure(_fail_msg(r))

    @task(2)
    def embeddings(self):
        payload = {"model": LITELLM_EMBED_MODEL, "input": random.choice(EMBEDDING_INPUTS)}
        with self.client.post(
            "/embeddings", headers=self.headers, json=payload,
            catch_response=True, name="/embeddings",
        ) as r:
            r.success() if _ok(r) else r.failure(_fail_msg(r))

    @task(1)
    def liveliness(self):
        # /health/liveliness returns quickly without probing upstream models
        with self.client.get(
            "/health/liveliness", headers=self.headers,
            catch_response=True, name="/health/liveliness",
        ) as r:
            r.success() if _ok(r) else r.failure(_fail_msg(r))

    @task(1)
    def models_list(self):
        with self.client.get(
            "/models", headers=self.headers,
            catch_response=True, name="/models",
        ) as r:
            r.success() if _ok(r) else r.failure(_fail_msg(r))


# ---------------------------------------------------------------------------
# Claude Code fixtures
# ---------------------------------------------------------------------------

_CC_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "Bash",
            "description": "Execute a bash command and return its output.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "description": {"type": "string"},
                    "timeout": {"type": "number"},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "Read",
            "description": "Read a file from the local filesystem.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "limit": {"type": "integer"},
                    "offset": {"type": "integer"},
                },
                "required": ["file_path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "Write",
            "description": "Write content to a file on the local filesystem.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["file_path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "Edit",
            "description": "Perform exact string replacements in a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {"type": "string"},
                    "old_string": {"type": "string"},
                    "new_string": {"type": "string"},
                    "replace_all": {"type": "boolean"},
                },
                "required": ["file_path", "old_string", "new_string"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "WebSearch",
            "description": "Search the web for information.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
]

_CC_SYSTEM = (
    "You are Claude Code, Anthropic's official CLI for Claude. "
    "You are an interactive agent that helps users with software engineering tasks. "
    "Use the tools available to you to assist the user. "
    "Primary working directory: /home/user/project. "
    "Platform: linux. Shell: bash."
)

_CC_STUBS = [
    [{"role": "user", "content": "What files are in the current directory?"}],
    [
        {"role": "user", "content": "Find all Python files that import requests."},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "Bash",
                    "arguments": json.dumps({"command": "grep -rl 'import requests' . --include='*.py'"}),
                },
            }],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": "src/api.py\nsrc/client.py\ntests/test_api.py"},
        {"role": "user", "content": "Show me the imports in src/api.py."},
    ],
    [
        {"role": "user", "content": "Add a docstring to the `fetch_data` function in src/api.py."},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": "call_2",
                "type": "function",
                "function": {"name": "Read", "arguments": json.dumps({"file_path": "src/api.py"})},
            }],
        },
        {"role": "tool", "tool_call_id": "call_2", "content": "def fetch_data(url):\n    return requests.get(url).json()\n"},
        {
            "role": "assistant",
            "content": "I'll add a docstring to `fetch_data`.",
            "tool_calls": [{
                "id": "call_3",
                "type": "function",
                "function": {
                    "name": "Edit",
                    "arguments": json.dumps({
                        "file_path": "src/api.py",
                        "old_string": "def fetch_data(url):\n    return requests.get(url).json()",
                        "new_string": 'def fetch_data(url):\n    """Fetch JSON data from the given URL."""\n    return requests.get(url).json()',
                    }),
                },
            }],
        },
        {"role": "tool", "tool_call_id": "call_3", "content": "File updated."},
        {"role": "user", "content": "Looks good. Now run the tests."},
    ],
]


class ClaudeCodeUser(HttpUser):
    """Simulates Claude Code agent sessions: tool use, multi-turn history, streaming."""

    wait_time = between(2, 8)

    def on_start(self):
        self.headers = {
            "Authorization": f"Bearer {LITELLM_API_KEY}",
            "Content-Type": "application/json",
        }

    def _chat(self, messages, stream=True, name="/chat/completions [cc]"):
        payload = {
            "model": CLAUDE_CODE_MODEL,
            "messages": messages,
            "tools": _CC_TOOLS,
            "max_tokens": 1024,
            "stream": stream,
        }
        with self.client.post(
            "/chat/completions", headers=self.headers, json=payload,
            stream=stream, catch_response=True, name=name,
        ) as r:
            if not _ok(r):
                r.failure(_fail_msg(r))
                return
            if stream:
                for _ in r.iter_lines():
                    pass
            r.success()

    @task(5)
    def agentic_turn(self):
        messages = [{"role": "system", "content": _CC_SYSTEM}] + random.choice(_CC_STUBS)
        self._chat(messages, stream=True, name="/chat/completions [cc stream]")

    @task(2)
    def short_turn(self):
        messages = [
            {"role": "system", "content": _CC_SYSTEM},
            {"role": "user", "content": random.choice(CHAT_PROMPTS)},
        ]
        self._chat(messages, stream=True, name="/chat/completions [cc short]")

    @task(1)
    def non_streaming_turn(self):
        messages = [
            {"role": "system", "content": _CC_SYSTEM},
            {"role": "user", "content": "List the 3 most important git commands."},
        ]
        self._chat(messages, stream=False, name="/chat/completions [cc no-stream]")
```
