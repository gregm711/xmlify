"""Convert JSON values to XML — used for serializing tool results back to the model."""

from __future__ import annotations

import re
from typing import Any

from .types import XmlifyOptions


def json_to_xml(value: Any, options: XmlifyOptions | None = None) -> str:
    """Convert a JSON value to XML, wrapped in a root element."""
    opts = options or XmlifyOptions()
    root = opts.result_root
    indent = opts.indent
    inner = _value_to_xml(value, 1, indent)
    return f"<{root}>\n{inner}\n</{root}>"


def _value_to_xml(value: Any, depth: int, indent_size: int) -> str:
    pad = " " * (depth * indent_size)

    if value is None:
        return f"{pad}<null/>"

    if isinstance(value, bool):
        return str(value).lower()

    if isinstance(value, (int, float)):
        return str(value)

    if isinstance(value, str):
        return _escape_xml(value)

    if isinstance(value, list):
        if not value:
            return ""
        parts = []
        for item in value:
            inner = _value_to_xml(item, depth + 1, indent_size)
            if "\n" not in inner and "<" not in inner:
                parts.append(f"{pad}<item>{inner}</item>")
            else:
                parts.append(f"{pad}<item>\n{inner}\n{pad}</item>")
        return "\n".join(parts)

    if isinstance(value, dict):
        if not value:
            return ""
        parts = []
        for key, val in value.items():
            safe = _sanitize_tag(key)
            inner = _value_to_xml(val, depth + 1, indent_size)

            if isinstance(val, list):
                if not val:
                    parts.append(f"{pad}<{safe}/>")
                else:
                    parts.append(f"{pad}<{safe}>\n{inner}\n{pad}</{safe}>")
            elif isinstance(val, dict):
                parts.append(f"{pad}<{safe}>\n{inner}\n{pad}</{safe}>")
            elif val is None:
                parts.append(f"{pad}<{safe}/>")
            else:
                parts.append(f"{pad}<{safe}>{inner}</{safe}>")
        return "\n".join(parts)

    return _escape_xml(str(value))


def _escape_xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _sanitize_tag(name: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", name)
    if not re.match(r"^[a-zA-Z_]", safe):
        safe = "_" + safe
    return safe
