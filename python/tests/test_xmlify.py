"""Tests for the xmlify Python package — mirrors the TS test suite + robustness tests."""

import pytest
from xmlify import xmlify, ToolDefinition, parse_tool_calls, json_to_xml
from xmlify.types import XmlifyOptions


SEARCH_TOOL = ToolDefinition(
    name="search",
    description="Search the web",
    parameters={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"},
            "limit": {"type": "integer", "description": "Max results"},
            "active": {"type": "boolean"},
            "tags": {"type": "array", "items": {"type": "string"}},
            "scores": {"type": "array", "items": {"type": "number"}},
            "config": {
                "type": "object",
                "properties": {
                    "mode": {"type": "string"},
                    "depth": {"type": "integer"},
                },
            },
        },
        "required": ["query"],
    },
)


class TestSchemaToXml:
    def test_basic_schema(self):
        session = xmlify([SEARCH_TOOL])
        assert '<tool name="search"' in session.tool_schema_xml
        assert "query" in session.tool_schema_xml
        assert 'required="true"' in session.tool_schema_xml

    def test_instruction_block(self):
        session = xmlify([SEARCH_TOOL])
        assert "tool_call" in session.instruction_block
        assert "Available tools:" in session.instruction_block


class TestXmlToJson:
    def test_basic_parse(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>hello world</query></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert len(calls) == 1
        assert calls[0].name == "search"
        assert calls[0].arguments["query"] == "hello world"

    def test_integer_coercion(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>test</query><limit>10</limit></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["limit"] == 10
        assert isinstance(calls[0].arguments["limit"], int)

    def test_boolean_true(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>test</query><active>True</active></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["active"] is True

    def test_boolean_false(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>test</query><active>FALSE</active></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["active"] is False

    def test_array_item_tags(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags><item>a</item><item>b</item></tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["tags"] == ["a", "b"]

    def test_array_comma_separated(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags>a,b,c</tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["tags"] == ["a", "b", "c"]

    def test_array_json_brackets(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><scores>[1.5, 2.5, 3.5]</scores></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["scores"] == [1.5, 2.5, 3.5]

    def test_array_json_brackets_strings(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags>["a", "b"]</tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["tags"] == ["a", "b"]

    def test_array_single_value(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags>just_one</tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["tags"] == ["just_one"]

    def test_array_empty(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags></tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["tags"] == []

    def test_array_dimension_string(self):
        tool = ToolDefinition(
            name="calc",
            description="calc",
            parameters={
                "type": "object",
                "properties": {"size": {"type": "array", "items": {"type": "integer"}}},
            },
        )
        xml = '<tool_call name="calc"><size>4 ft x 4 ft</size></tool_call>'
        calls = parse_tool_calls(xml, [tool])
        assert calls[0].arguments["size"] == [4, 4]

    def test_nested_object(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><config><mode>fast</mode><depth>3</depth></config></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["config"] == {"mode": "fast", "depth": 3}

    def test_xml_entities(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>a &amp; b &lt; c</query></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert calls[0].arguments["query"] == "a & b < c"

    def test_multiple_tool_calls(self):
        tools = [SEARCH_TOOL]
        xml = (
            '<tool_call name="search"><query>first</query></tool_call>\n'
            '<tool_call name="search"><query>second</query></tool_call>'
        )
        calls = parse_tool_calls(xml, tools)
        assert len(calls) == 2
        assert calls[0].arguments["query"] == "first"
        assert calls[1].arguments["query"] == "second"

    def test_no_item_leaking(self):
        tools = [SEARCH_TOOL]
        xml = '<tool_call name="search"><query>t</query><tags><item>a</item><item>b</item></tags></tool_call>'
        calls = parse_tool_calls(xml, tools)
        assert "item" not in calls[0].arguments


class TestJsonToXml:
    def test_simple_object(self):
        result = json_to_xml({"status": "ok", "count": 3})
        assert "<result>" in result
        assert "<status>ok</status>" in result
        assert "<count>3</count>" in result

    def test_array(self):
        result = json_to_xml({"items": [1, 2, 3]})
        assert "<item>1</item>" in result
        assert "<item>2</item>" in result

    def test_nested(self):
        result = json_to_xml({"data": {"name": "test"}})
        assert "<data>" in result
        assert "<name>test</name>" in result


class TestSession:
    def test_format_result(self):
        session = xmlify([SEARCH_TOOL])
        xml = session.format_result("search", {"results": ["a", "b"]})
        assert "<search_result>" in xml
        assert "<item>a</item>" in xml

    def test_parse_response(self):
        session = xmlify([SEARCH_TOOL])
        xml = '<tool_call name="search"><query>hello</query></tool_call>'
        calls = session.parse_response(xml)
        assert len(calls) == 1
        assert calls[0].arguments["query"] == "hello"
