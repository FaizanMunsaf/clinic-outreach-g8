"""
CLI helper for Graph8 MCP (dev / debugging).

Usage (from backend/):
  python -m scripts.mcp_cli --names
  python -m scripts.mcp_cli --call g8_current_org
  python -m scripts.mcp_cli --search workflow
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys

from app.graph8_client import call_tool, graph8_client

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


async def run_list(names_only: bool) -> None:
    async with graph8_client() as client:
        tools: list = []
        cursor = None
        while True:
            result = await client.list_tools(cursor=cursor)
            tools.extend(result.tools)
            cursor = getattr(result, "next_cursor", None)
            if not cursor:
                break

        print(f"Found {len(tools)} tool(s)\n")
        for i, tool in enumerate(tools, start=1):
            if names_only:
                print(f"{i}. {tool.name}")
            else:
                schema = getattr(tool, "input_schema", None) or getattr(
                    tool, "inputSchema", None
                )
                print("=" * 60)
                print(f"NAME: {tool.name}")
                print(f"DESCRIPTION: {tool.description}")
                print(f"INPUT SCHEMA: {json.dumps(schema, indent=2)}")


async def run_call(name: str, args_json: str) -> None:
    arguments = json.loads(args_json) if args_json else {}
    payload = await call_tool(name, arguments)
    print(json.dumps(payload, indent=2, default=str))


def main() -> None:
    p = argparse.ArgumentParser(description="Graph8 MCP CLI")
    p.add_argument("--names", action="store_true")
    p.add_argument("--call", metavar="TOOL")
    p.add_argument("--args", default="{}")
    p.add_argument("--search", metavar="QUERY")
    args = p.parse_args()

    if args.search:
        asyncio.run(run_call("g8_tool_search", json.dumps({"query": args.search})))
    elif args.call:
        asyncio.run(run_call(args.call, args.args))
    else:
        asyncio.run(run_list(names_only=args.names))


if __name__ == "__main__":
    main()
