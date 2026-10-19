"""Shared Graph8 MCP client for the Clinic Outreach API."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

load_dotenv()

logger = logging.getLogger(__name__)

MCP_URL = os.getenv("G8_MCP_URL", "https://be.graph8.com/mcp/")
API_KEY = os.getenv("G8_API_KEY")

# Graph8's streamable HTTP endpoint flakes under concurrent initialize sessions.
# Serialize all tool calls and retry transient transport errors.
_mcp_lock = asyncio.Lock()
_MAX_ATTEMPTS = 3
_RETRY_BASE_S = 0.5

# Tools that are not always-on in Graph8's connect-time tools/list — activate
# them in-session via g8_tool_search before calling.
_NEEDS_SEARCH: frozenset[str] = frozenset(
    {
        "g8_crm_get_list_contacts",
        "g8_crm_list_contact_columns",
        "g8_crm_remove_contacts_from_list",
    }
)


class Graph8ToolError(RuntimeError):
    """Raised when a Graph8 MCP tool returns an error payload."""


def _is_transient(message: str) -> bool:
    lower = message.lower()
    needles = (
        "server returned an error response",
        "unsupported protocol version",
        "connection reset",
        "timed out",
        "timeout",
        "temporarily unavailable",
        "503",
        "502",
        "429",
        "broken pipe",
        "server disconnected",
        "remoteprotocolerror",
    )
    return any(n in lower for n in needles)


@asynccontextmanager
async def graph8_client() -> AsyncIterator[Client]:
    if not API_KEY:
        raise RuntimeError("Missing API key. Set G8_API_KEY in backend/.env")

    async with httpx2.AsyncClient(
        headers={"Authorization": f"Bearer {API_KEY}"},
        timeout=httpx2.Timeout(30.0, read=300.0),
        follow_redirects=True,
    ) as http:
        transport = streamable_http_client(MCP_URL, http_client=http)
        # Graph8 supports handshake-era versions only (through 2025-11-25).
        # mcp>=2.2 defaults to mode="auto" which probes 2026-07-28 and gets 400.
        async with Client(transport, mode="legacy") as client:
            yield client


def _content_texts(result: Any) -> list[str]:
    content = getattr(result, "content", None) or []
    texts: list[str] = []
    for block in content:
        text = getattr(block, "text", None)
        if text is not None:
            texts.append(text)
    return texts


def _result_payload(result: Any) -> Any:
    structured = getattr(result, "structured_content", None)
    if structured is not None:
        return structured

    texts = _content_texts(result)
    if len(texts) == 1:
        try:
            return json.loads(texts[0])
        except json.JSONDecodeError:
            return {"text": texts[0]}
    if texts:
        return {"texts": texts}
    return {"raw": str(result)}


def _error_detail(result: Any) -> str:
    texts = _content_texts(result)
    if texts:
        return " | ".join(texts)
    structured = getattr(result, "structured_content", None)
    if structured is not None:
        return json.dumps(structured, default=str)
    return "Graph8 tool returned an error with no details"


def _flatten_exc(exc: BaseException) -> str:
    """Turn ExceptionGroup / nested errors into a readable string."""
    if isinstance(exc, BaseExceptionGroup):
        parts = [_flatten_exc(e) for e in exc.exceptions]
        return "; ".join(parts)
    parts = [str(exc)]
    cause = exc.__cause__ or exc.__context__
    if cause is not None and cause is not exc:
        nested = _flatten_exc(cause)
        if nested and nested not in parts[0]:
            parts.append(nested)
    # MCP sometimes only says "Server returned an error response"
    for attr in ("response", "body", "detail", "message"):
        val = getattr(exc, attr, None)
        if val is None:
            continue
        try:
            text = val if isinstance(val, str) else json.dumps(val, default=str)
        except Exception:
            text = str(val)
        if text and text not in parts[0] and "Server returned an error" not in text:
            parts.append(text[:800])
    return " | ".join(p for p in parts if p)


async def _call_tool_once(name: str, arguments: dict[str, Any] | None) -> Any:
    org_url = os.getenv("G8_SAFE_ORG_URL")
    async with graph8_client() as client:
        # Org must be confirmed per session before prospecting tools
        if name != "g8_current_org":
            org_args: dict[str, Any] = {}
            if org_url:
                org_args["safe_org_url"] = org_url
            org_result = await client.call_tool("g8_current_org", arguments=org_args)
            if getattr(org_result, "is_error", False):
                raise Graph8ToolError(f"g8_current_org: {_error_detail(org_result)}")

        if name in _NEEDS_SEARCH:
            # Activate progressive-discovery tools for this session
            search = await client.call_tool(
                "g8_tool_search",
                arguments={"tool_names": [name]},
            )
            if getattr(search, "is_error", False):
                logger.warning("g8_tool_search(%s) failed: %s", name, _error_detail(search))

        result = await client.call_tool(name, arguments=arguments or {})
        if getattr(result, "is_error", False):
            raise Graph8ToolError(f"{name}: {_error_detail(result)}")
        return _result_payload(result)


async def call_tool(name: str, arguments: dict[str, Any] | None = None) -> Any:
    """Call a Graph8 MCP tool, establishing org context in the same session.

    Concurrent UI requests open many MCP handshakes; Graph8 often returns a
    generic 400/502 under that load. We serialize sessions and retry transients.
    """
    last_error: BaseException | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            async with _mcp_lock:
                return await _call_tool_once(name, arguments)
        except Graph8ToolError:
            raise
        except BaseException as exc:
            last_error = exc
            detail = _flatten_exc(exc)
            if not _is_transient(detail) or attempt >= _MAX_ATTEMPTS:
                raise RuntimeError(detail) from exc
            delay = _RETRY_BASE_S * attempt
            logger.warning(
                "Graph8 MCP transient error on %s (attempt %s/%s): %s — retry in %.1fs",
                name,
                attempt,
                _MAX_ATTEMPTS,
                detail[:200],
                delay,
            )
            await asyncio.sleep(delay)
    assert last_error is not None
    raise RuntimeError(_flatten_exc(last_error)) from last_error
