"""xmlify-tools: Transparent JSON↔XML translation layer for LLM tool calling."""

from .core import xmlify, XmlifySession
from .schema_to_xml import tool_to_xml_schema, tools_to_xml_schema
from .xml_to_json import parse_tool_calls
from .json_to_xml import json_to_xml
from .types import ToolDefinition, JsonSchema, ParsedToolCall

__all__ = [
    "xmlify",
    "XmlifySession",
    "tool_to_xml_schema",
    "tools_to_xml_schema",
    "parse_tool_calls",
    "json_to_xml",
    "ToolDefinition",
    "JsonSchema",
    "ParsedToolCall",
]
