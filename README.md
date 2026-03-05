# xmlify-tools

Transparent JSON-to-XML translation layer for LLM tool calling. Models prefer XML -- your framework speaks JSON. This package sits in between.

## Why?

LLMs are trained on massive amounts of XML (HTML, RSS, SVG, XHTML, config files). XML's explicit open/close tags give models stronger structural cues than JSON's brackets and commas. But every tool-calling framework (OpenAI, Anthropic, LangChain, Vercel AI SDK) speaks JSON.

xmlify bridges the gap:

```
Your Framework (JSON tool schemas)
        |
    [xmlify]  -->  Model sees XML schemas + XML results
        |
    [xmlify]  <--  Model responds with XML tool calls
        |
Your Framework (JSON tool call args)
```

## Install

```bash
npm install xmlify-tools
```

## Quick Start

```ts
import { xmlify } from 'xmlify-tools'

// Your existing JSON tool definitions (OpenAI/Anthropic format)
const tools = [
  {
    name: 'search',
    description: 'Search the web',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'integer', description: 'Max results' },
      },
      required: ['query'],
    },
  },
]

const session = xmlify(tools)

// 1. Inject XML tool schemas into system prompt
const systemPrompt = `You are a helpful assistant.\n\n${session.instructionBlock}`

// 2. Model responds with XML tool calls:
//    <tool_call name="search">
//      <query>best pizza in NYC</query>
//      <limit>5</limit>
//    </tool_call>

// 3. Parse model response back to JSON
const calls = session.parseResponse(modelOutput)
// => [{ name: 'search', arguments: { query: 'best pizza in NYC', limit: 5 } }]

// 4. Execute your tool, then format result as XML for the model
const result = await executeTool(calls[0])
const xmlResult = session.formatResult('search', result)
// => <search_result><items><item><title>Joe's Pizza</title>...</item></items></search_result>
```

## API

### `xmlify(tools, options?)`

Creates a session for a set of tools. Returns:

- `toolSchemaXml` - XML schema string to inject into prompts
- `instructionBlock` - Full instruction text with usage guide + schemas
- `formatResult(toolName, result)` - Convert JSON tool result to XML
- `parseResponse(text)` - Extract tool calls from model's XML response

### `toolToXmlSchema(tool, options?)` / `toolsToXmlSchema(tools, options?)`

Convert JSON Schema tool definitions to XML schema descriptions.

### `jsonToXml(value, options?)`

Convert any JSON value to XML.

### `parseToolCalls(text, tools)`

Parse `<tool_call>` blocks from text, with schema-aware type coercion.

### Options

```ts
{
  typeHints?: boolean   // Include type="string" attributes (default: false)
  indent?: number       // Pretty print indent size (default: 2)
  resultRoot?: string   // Root element name for results (default: "result")
}
```

## What the Model Sees

Instead of this JSON schema blob:

```json
{
  "name": "browser",
  "parameters": {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "URL to navigate to" },
      "action": { "type": "string", "enum": ["click", "type", "scroll"] }
    },
    "required": ["url"]
  }
}
```

The model sees:

```xml
<tool name="browser" description="Browse a URL and interact with the page">
  <parameters>
    <url required="true">URL to navigate to</url>
    <action enum="click,type,scroll">Action to perform</action>
  </parameters>
</tool>
```

And responds with:

```xml
<tool_call name="browser">
  <url>https://example.com</url>
  <action>click</action>
</tool_call>
```

## License

MIT
