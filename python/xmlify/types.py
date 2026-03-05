"""Type definitions for xmlify."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


JsonSchema = dict[str, Any]
"""A JSON Schema object (subset relevant for tool parameters)."""


@dataclass
class ToolDefinition:
    """Standard tool definition — compatible with OpenAI/Anthropic/Google formats."""

    name: str
    description: str
    parameters: JsonSchema


@dataclass
class ParsedToolCall:
    """A parsed tool call extracted from the model's XML response."""

    name: str
    arguments: dict[str, Any]


@dataclass
class XmlifyOptions:
    """Options for XML generation."""

    type_hints: bool = False
    indent: int = 2
    result_root: str = "result"
