"""Convert JSON Schema tool definitions to XML schema descriptions."""

from __future__ import annotations

from .types import JsonSchema, ToolDefinition, XmlifyOptions


def tool_to_xml_schema(tool: ToolDefinition, options: XmlifyOptions | None = None) -> str:
    """Convert a single tool definition to an XML schema description."""
    opts = options or XmlifyOptions()
    indent = opts.indent
    pad = lambda depth: " " * (depth * indent)

    lines: list[str] = []
    lines.append(f'<tool name="{_escape_attr(tool.name)}" description="{_escape_attr(tool.description)}">')
    lines.append(f"{pad(1)}<parameters>")

    props = tool.parameters.get("properties", {})
    required = set(tool.parameters.get("required", []))
    for key, schema in props.items():
        lines.append(_schema_property_to_xml(key, schema, key in required, 2, indent, opts))

    lines.append(f"{pad(1)}</parameters>")
    lines.append("</tool>")
    return "\n".join(lines)


def tools_to_xml_schema(tools: list[ToolDefinition], options: XmlifyOptions | None = None) -> str:
    """Convert multiple tool definitions to XML."""
    opts = options or XmlifyOptions()
    parts = [tool_to_xml_schema(t, opts) for t in tools]
    indented = "\n".join(_indent_block(p, opts.indent) for p in parts)
    return f"<tools>\n{indented}\n</tools>"


def _schema_property_to_xml(
    name: str,
    schema: JsonSchema,
    is_required: bool,
    depth: int,
    indent_size: int,
    options: XmlifyOptions,
) -> str:
    pad = " " * (depth * indent_size)
    attrs: list[str] = []

    if options.type_hints and schema.get("type"):
        attrs.append(f'type="{_escape_attr(schema["type"])}"')
    if is_required:
        attrs.append('required="true"')
    if schema.get("enum"):
        attrs.append(f'enum="{_escape_attr(",".join(schema["enum"]))}"')
    if schema.get("default") is not None:
        attrs.append(f'default="{_escape_attr(str(schema["default"]))}"')

    attr_str = (" " + " ".join(attrs)) if attrs else ""

    # Object type — recurse
    if schema.get("type") == "object" and schema.get("properties"):
        lines = [f"{pad}<{name}{attr_str}>"]
        req = set(schema.get("required", []))
        for key, child in schema["properties"].items():
            lines.append(_schema_property_to_xml(key, child, key in req, depth + 1, indent_size, options))
        lines.append(f"{pad}</{name}>")
        return "\n".join(lines)

    # Array type — show item template
    if schema.get("type") == "array" and schema.get("items"):
        lines = [f"{pad}<{name}{attr_str}>"]
        lines.append(_schema_property_to_xml("item", schema["items"], False, depth + 1, indent_size, options))
        lines.append(f"{pad}</{name}>")
        return "\n".join(lines)

    # Leaf node
    desc = _escape_xml(schema.get("description", ""))
    return f"{pad}<{name}{attr_str}>{desc}</{name}>"


def _escape_attr(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


def _escape_xml(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _indent_block(block: str, size: int) -> str:
    pad = " " * size
    return "\n".join(pad + line for line in block.split("\n"))
