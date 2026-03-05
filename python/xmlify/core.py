"""High-level wrapper that creates an xmlify session for a set of tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .types import ToolDefinition, ParsedToolCall, XmlifyOptions
from .schema_to_xml import tools_to_xml_schema
from .json_to_xml import json_to_xml
from .xml_to_json import parse_tool_calls


@dataclass
class XmlifySession:
    """A session wrapping a set of tools for XML-based tool calling."""

    tools: list[ToolDefinition]
    options: XmlifyOptions
    tool_schema_xml: str
    instruction_block: str

    def format_result(self, tool_name: str, result: Any) -> str:
        """Convert a tool result to XML for the model."""
        opts = XmlifyOptions(
            type_hints=self.options.type_hints,
            indent=self.options.indent,
            result_root=f"{tool_name}_result",
        )
        return json_to_xml(result, opts)

    def parse_response(self, text: str) -> list[ParsedToolCall]:
        """Parse tool calls from the model's XML response."""
        return parse_tool_calls(text, self.tools)


def xmlify(tools: list[ToolDefinition], options: XmlifyOptions | None = None) -> XmlifySession:
    """Create an xmlify session for a set of tools.

    Usage::

        from xmlify import xmlify, ToolDefinition

        tools = [ToolDefinition(name="search", description="Search the web", parameters={...})]
        session = xmlify(tools)

        # Inject into system prompt
        system_prompt = "You are helpful.\\n\\n" + session.instruction_block

        # Parse model's XML response
        calls = session.parse_response(model_output_text)

        # Format tool result as XML
        xml_result = session.format_result("search", {"results": [...]})
    """
    opts = options or XmlifyOptions()
    schema_xml = tools_to_xml_schema(tools, opts)

    instruction_block = "\n".join([
        "You have access to the following tools. Tool schemas are defined in XML format.",
        "When you want to call a tool, respond with a <tool_call> XML block:",
        "",
        '<tool_call name="tool_name">',
        "  <param_name>value</param_name>",
        "</tool_call>",
        "",
        "Available tools:",
        "",
        schema_xml,
    ])

    return XmlifySession(
        tools=tools,
        options=opts,
        tool_schema_xml=schema_xml,
        instruction_block=instruction_block,
    )
