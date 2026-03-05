"""Parse XML tool calls from model responses back to JSON with schema-aware type coercion."""

from __future__ import annotations

import re
from typing import Any

from .types import JsonSchema, ParsedToolCall, ToolDefinition


def parse_tool_calls(xml_text: str, tools: list[ToolDefinition]) -> list[ParsedToolCall]:
    """Parse <tool_call> blocks from the model's XML response text."""
    tool_map = {t.name: t for t in tools}
    calls: list[ParsedToolCall] = []

    for m in re.finditer(r'<tool_call\s+name="([^"]+)"[^>]*>([\s\S]*?)</tool_call>', xml_text):
        name = m.group(1)
        body = m.group(2)
        tool = tool_map.get(name)
        schema = tool.parameters if tool else None
        args = _parse_xml_element(body, schema)
        calls.append(ParsedToolCall(name=name, arguments=args))

    return calls


def _parse_xml_element(xml_body: str, schema: JsonSchema | None) -> dict[str, Any]:
    """Parse an XML element body into a dict, using schema for type coercion."""
    result: dict[str, Any] = {}

    # Self-closing tags
    for m in re.finditer(r"<([a-zA-Z_][a-zA-Z0-9_.-]*)(?:\s[^>]*)?\s*/>", xml_body):
        result[m.group(1)] = None

    # Collect tag names (skip self-closing)
    names: set[str] = set()
    for m in re.finditer(r"<([a-zA-Z_][a-zA-Z0-9_.-]*)(?:\s[^>]*)?>", xml_body):
        before = xml_body[: m.end()]
        if not before.endswith("/>"):
            names.add(m.group(1))

    for name in names:
        if name == "item":
            continue

        escaped = re.escape(name)
        content_match = re.search(
            rf"<{escaped}(?:\s[^>]*)?>([\s\S]*?)</{escaped}>", xml_body
        )
        if content_match:
            prop_schema = (schema or {}).get("properties", {}).get(name)
            result[name] = _parse_value(content_match.group(1), prop_schema)

    return result


def _parse_value(content: str, schema: JsonSchema | None) -> Any:
    """Parse a value from XML content, using schema for type coercion."""
    trimmed = content.strip()

    # Object type
    if schema and schema.get("type") == "object" and schema.get("properties"):
        return _parse_xml_element(trimmed, schema)

    # Array type
    if schema and schema.get("type") == "array":
        return _parse_array(trimmed, schema.get("items"))

    # No schema — try to detect structure
    if re.search(r"<[a-zA-Z_]", trimmed) and not (schema and schema.get("type")):
        if re.search(r"<item[\s>/]", trimmed):
            return _parse_array(trimmed, None)
        return _parse_xml_element(trimmed, schema)

    return _coerce_scalar(trimmed, schema)


def _parse_array(content: str, item_schema: JsonSchema | None) -> list[Any]:
    """Parse array values from XML content."""
    items: list[Any] = []

    for m in re.finditer(r"<item(?:\s[^>]*)?\s*/>|<item(?:\s[^>]*)?>([\s\S]*?)</item>", content):
        if m.group(1) is None:
            items.append(None)
        else:
            items.append(_parse_value(m.group(1), item_schema))

    # Fallback: comma-separated, JSON brackets, dimension strings
    if not items and content.strip():
        raw = content.strip()

        # Strip JSON-style brackets
        if raw.startswith("[") and raw.endswith("]"):
            raw = raw[1:-1]

        # Try comma split, then " x " (dimension pattern)
        parts = [s.strip() for s in raw.split(",") if s.strip()]
        if len(parts) <= 1 and re.search(r"\bx\b", raw, re.IGNORECASE):
            parts = [s.strip() for s in re.split(r"\s*x\s*", raw, flags=re.IGNORECASE) if s.strip()]

        for part in parts:
            # Strip JSON-style quotes
            cleaned = re.sub(r'^["\'](.*)["\']\s*$', r"\1", part)
            # Extract leading number if schema expects numeric
            if item_schema and item_schema.get("type") in ("number", "integer"):
                num_match = re.match(r"^-?\d+(?:\.\d+)?", cleaned)
                if num_match:
                    cleaned = num_match.group(0)
            items.append(_coerce_scalar(cleaned, item_schema))

    return items


def _coerce_scalar(value: str, schema: JsonSchema | None) -> Any:
    """Coerce a string value to the appropriate Python type."""
    unescaped = _unescape_xml(value)
    lower = unescaped.lower()

    schema_type = schema.get("type") if schema else None

    if not schema_type:
        # Best-effort inference
        if lower == "true":
            return True
        if lower == "false":
            return False
        if lower == "null" or unescaped == "":
            return None
        try:
            num = float(unescaped)
            if num == int(num) and "." not in unescaped:
                return int(num)
            return num
        except ValueError:
            return unescaped

    if schema_type in ("number", "integer"):
        try:
            n = float(unescaped)
            return int(n) if schema_type == "integer" else n
        except ValueError:
            return 0
    if schema_type == "boolean":
        return lower == "true" or unescaped == "1"
    if schema_type == "null":
        return None
    return unescaped


def _unescape_xml(s: str) -> str:
    return (
        s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )
