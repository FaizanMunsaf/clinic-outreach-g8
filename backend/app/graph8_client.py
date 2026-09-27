"""Shared Graph8 MCP client for the Clinic Outreach API."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx2
from dotenv import load_dotenv
from mcp import Client
from mcp.client.streamable_http import streamable_http_client

load_dotenv()

MCP_URL = os.getenv("G8_MCP_URL", "https://be.graph8.com/mcp/")
API_KEY = os.getenv("G8_API_KEY")


class Graph8ToolError(RuntimeError):
    """Raised when a Graph8 MCP tool returns an error payload."""


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
        async with Client(transport) as client:
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
    return str(exc)


async def call_tool(name: str, arguments: dict[str, Any] | None = None) -> Any:
    """Call a Graph8 MCP tool, establishing org context in the same session."""
    org_url = os.getenv("G8_SAFE_ORG_URL")
    try:
        async with graph8_client() as client:
            # Org must be confirmed per session before prospecting tools
            if name != "g8_current_org":
                org_args: dict[str, Any] = {}
                if org_url:
                    org_args["safe_org_url"] = org_url
                org_result = await client.call_tool("g8_current_org", arguments=org_args)
                if getattr(org_result, "is_error", False):
                    raise Graph8ToolError(
                        f"g8_current_org: {_error_detail(org_result)}"
                    )
            result = await client.call_tool(name, arguments=arguments or {})
            if getattr(result, "is_error", False):
                raise Graph8ToolError(f"{name}: {_error_detail(result)}")
            return _result_payload(result)
    except Graph8ToolError:
        raise
    except BaseException as exc:
        raise RuntimeError(_flatten_exc(exc)) from exc
