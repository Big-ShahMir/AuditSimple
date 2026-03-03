#!/usr/bin/env python3
"""
Compatibility tests for DeepSeek V3.2 via NVIDIA NIM.

This script reproduces the four manual PowerShell checks with valid JSON
encoding so transport issues do not mask model or schema behavior.

Usage:
    python apps/web/scripts/test_deepseek_nvidia.py

Environment:
    NVIDIA_API_KEY must be set, or present in apps/web/.env
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
MODEL = "deepseek-ai/deepseek-v3.2"
TIMEOUT_SECONDS = 60


def load_env_file() -> None:
    if os.environ.get("NVIDIA_API_KEY"):
        return

    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def print_header(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def summarize_headers(headers: dict[str, str]) -> None:
    for key in ("Date", "Content-Type", "Content-Length", "X-Request-Id"):
        value = headers.get(key)
        if value:
            print(f"{key}: {value}")


def try_parse_json(text: str) -> Any:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def post_json(payload: dict[str, Any]) -> tuple[int, dict[str, str], str]:
    api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("NVIDIA_API_KEY is not set in the environment or apps/web/.env")

    body = json.dumps(payload).encode("utf-8")
    request = Request(
        API_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.getcode()
            headers = dict(response.headers.items())
            text = response.read().decode("utf-8", errors="replace")
            return status, headers, text
    except HTTPError as exc:
        text = exc.read().decode("utf-8", errors="replace")
        return exc.code, dict(exc.headers.items()), text
    except URLError as exc:
        raise RuntimeError(f"Network error: {exc}") from exc


def print_response(status: int, headers: dict[str, str], body: str) -> None:
    print(f"HTTP {status}")
    summarize_headers(headers)
    print()
    print(body.strip() or "(empty body)")


def interpret_test_1(status: int) -> None:
    print()
    if status == 200:
        print("Interpretation: basic auth + model reachability succeeded.")
    elif status in (401, 403):
        print("Interpretation: API key is invalid or unauthorized for this endpoint.")
    else:
        print("Interpretation: request reached the endpoint, but did not pass the basic check.")


def interpret_test_2(status: int) -> None:
    print()
    if status == 200:
        print("Interpretation: response_format json_object is accepted.")
    elif status == 400:
        print("Interpretation: response_format json_object appears to be rejected.")
    else:
        print("Interpretation: inconclusive for response_format support.")


def interpret_test_3(status: int) -> None:
    print()
    if status == 200:
        print('Interpretation: tool_choice = "required" is accepted.')
    elif status == 400:
        print('Interpretation: tool_choice = "required" appears to be rejected.')
    else:
        print("Interpretation: inconclusive for tool_choice support.")


def interpret_test_4(status: int, body: str, prior_test_3_status: int) -> None:
    print()
    if prior_test_3_status == 200 and status == 400:
        print('Interpretation: nullable type ["string", "null"] is a strong bug candidate.')
        return
    if status == 200:
        print('Interpretation: nullable type ["string", "null"] is accepted.')
        parsed = try_parse_json(body)
        if isinstance(parsed, dict):
            choices = parsed.get("choices")
            if isinstance(choices, list) and choices:
                message = choices[0].get("message", {})
                tool_calls = message.get("tool_calls", [])
                if tool_calls:
                    try:
                        arguments = json.loads(tool_calls[0]["function"]["arguments"])
                        print(f"Model tool arguments: {json.dumps(arguments, ensure_ascii=True)}")
                    except Exception:
                        pass
        return
    print("Interpretation: inconclusive for nullable type support.")


def run_test(title: str, payload: dict[str, Any]) -> tuple[int, str]:
    print_header(title)
    status, headers, body = post_json(payload)
    print_response(status, headers, body)
    return status, body


def main() -> int:
    load_env_file()

    print("DeepSeek V3.2 compatibility test")
    print(f"Endpoint: {API_URL}")
    print(f"Model:    {MODEL}")

    try:
        status_1, _ = run_test(
            "Test 1: Basic reachability (auth + model)",
            {
                "model": MODEL,
                "messages": [{"role": "user", "content": "Reply with OK"}],
                "max_tokens": 10,
            },
        )
        interpret_test_1(status_1)

        status_2, _ = run_test(
            "Test 2: JSON mode (response_format)",
            {
                "model": MODEL,
                "max_tokens": 50,
                "temperature": 0,
                "response_format": {"type": "json_object"},
                "messages": [
                    {
                        "role": "system",
                        "content": 'Return only JSON: {"contractType":"UNKNOWN","confidence":1}',
                    },
                    {
                        "role": "user",
                        "content": "Classify this: CREDIT CARD AGREEMENT",
                    },
                ],
            },
        )
        interpret_test_2(status_2)

        status_3, _ = run_test(
            'Test 3: tool_choice = "required"',
            {
                "model": MODEL,
                "max_tokens": 100,
                "temperature": 0,
                "messages": [{"role": "user", "content": "Call ping with value pong."}],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "ping",
                            "description": "Ping",
                            "parameters": {
                                "type": "object",
                                "properties": {"value": {"type": "string"}},
                                "required": ["value"],
                            },
                        },
                    }
                ],
                "tool_choice": "required",
            },
        )
        interpret_test_3(status_3)

        status_4, body_4 = run_test(
            'Test 4: nullable schema type ["string", "null"]',
            {
                "model": MODEL,
                "max_tokens": 100,
                "temperature": 0,
                "messages": [{"role": "user", "content": "There is no annual fee."}],
                "tools": [
                    {
                        "type": "function",
                        "function": {
                            "name": "extract_annual_fee",
                            "description": "Extract annual fee",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "rawValue": {"type": ["string", "null"]},
                                },
                                "required": ["rawValue"],
                            },
                        },
                    }
                ],
                "tool_choice": "required",
            },
        )
        interpret_test_4(status_4, body_4, status_3)
        return 0
    except Exception as exc:
        print()
        print(f"Fatal error: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
