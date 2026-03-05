import type { BenchmarkSuite } from "../types.js";

/**
 * A sample benchmark suite covering the key categories
 * where XML should outperform JSON schemas.
 *
 * Use this to validate your setup before running a real benchmark.
 * Replace with BFCL or your own test cases for real measurements.
 */
export const sampleSuite: BenchmarkSuite = {
  name: "xmlify-sample",
  description: "Sample test cases covering key tool calling patterns",
  cases: [
    // ----- Simple -----
    {
      id: "simple-search",
      category: "simple",
      tools: [
        {
          name: "web_search",
          description: "Search the web for information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query" },
            },
            required: ["query"],
          },
        },
      ],
      prompt: "Search for the latest news about SpaceX launches.",
      expected: [
        {
          name: "web_search",
          arguments: { query: undefined }, // any query is fine
        },
      ],
    },
    {
      id: "simple-weather",
      category: "simple",
      tools: [
        {
          name: "get_weather",
          description: "Get current weather for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
              units: {
                type: "string",
                description: "Temperature units",
                enum: ["celsius", "fahrenheit"],
              },
            },
            required: ["city"],
          },
        },
      ],
      prompt: "What's the weather like in Tokyo in celsius?",
      expected: [
        {
          name: "get_weather",
          arguments: { city: "Tokyo", units: "celsius" },
        },
      ],
    },

    // ----- Enum adherence -----
    {
      id: "enum-strict",
      category: "enum",
      tools: [
        {
          name: "set_priority",
          description: "Set the priority of a task",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string", description: "Task identifier" },
              priority: {
                type: "string",
                description: "Priority level",
                enum: ["critical", "high", "medium", "low"],
              },
            },
            required: ["task_id", "priority"],
          },
        },
      ],
      prompt: "Set task PROJ-123 to high priority.",
      expected: [
        {
          name: "set_priority",
          arguments: { task_id: "PROJ-123", priority: "high" },
        },
      ],
    },

    // ----- Nested objects -----
    {
      id: "nested-address",
      category: "nested",
      tools: [
        {
          name: "create_contact",
          description: "Create a new contact with address information",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "Full name" },
              email: { type: "string", description: "Email address" },
              address: {
                type: "object",
                description: "Mailing address",
                properties: {
                  street: { type: "string", description: "Street address" },
                  city: { type: "string", description: "City" },
                  state: { type: "string", description: "State/province" },
                  zip: { type: "string", description: "Postal code" },
                  country: { type: "string", description: "Country" },
                },
                required: ["street", "city", "country"],
              },
            },
            required: ["name", "email", "address"],
          },
        },
      ],
      prompt:
        "Create a contact for Jane Smith, jane@example.com, at 123 Main St, San Francisco, CA 94105, US.",
      expected: [
        {
          name: "create_contact",
          arguments: {
            name: "Jane Smith",
            email: "jane@example.com",
            address: {
              street: "123 Main St",
              city: "San Francisco",
              state: "CA",
              zip: "94105",
              country: "US",
            },
          },
        },
      ],
    },

    // ----- Arrays -----
    {
      id: "array-tags",
      category: "array",
      tools: [
        {
          name: "create_issue",
          description: "Create a GitHub issue with labels",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Issue title" },
              body: { type: "string", description: "Issue description" },
              labels: {
                type: "array",
                description: "Labels to apply",
                items: { type: "string" },
              },
            },
            required: ["title", "body"],
          },
        },
      ],
      prompt:
        'Create a GitHub issue titled "Fix login bug" with description "Users cannot log in with SSO" and labels bug, auth, and urgent.',
      expected: [
        {
          name: "create_issue",
          arguments: {
            title: "Fix login bug",
            body: undefined, // any description
            labels: ["bug", "auth", "urgent"],
          },
        },
      ],
    },

    // ----- Multiple tool calls -----
    {
      id: "multi-parallel",
      category: "parallel",
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
            },
            required: ["city"],
          },
        },
      ],
      prompt: "What's the weather in both New York and London?",
      expected: [
        { name: "get_weather", arguments: { city: "New York" } },
        { name: "get_weather", arguments: { city: "London" } },
      ],
    },

    // ----- Tool selection (multiple tools available) -----
    {
      id: "select-correct-tool",
      category: "selection",
      tools: [
        {
          name: "send_email",
          description: "Send an email message",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string", description: "Recipient email" },
              subject: { type: "string", description: "Email subject" },
              body: { type: "string", description: "Email body" },
            },
            required: ["to", "subject", "body"],
          },
        },
        {
          name: "send_slack",
          description: "Send a Slack message to a channel",
          parameters: {
            type: "object",
            properties: {
              channel: { type: "string", description: "Channel name" },
              message: { type: "string", description: "Message text" },
            },
            required: ["channel", "message"],
          },
        },
        {
          name: "create_calendar_event",
          description: "Create a calendar event",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string", description: "Event title" },
              date: { type: "string", description: "Date in YYYY-MM-DD" },
              time: { type: "string", description: "Time in HH:MM" },
            },
            required: ["title", "date"],
          },
        },
      ],
      prompt: 'Send a Slack message to #engineering saying "Deploy complete".',
      expected: [
        {
          name: "send_slack",
          arguments: {
            channel: undefined, // could be "#engineering" or "engineering"
            message: undefined, // should contain "Deploy complete"
          },
        },
      ],
    },

    // ----- Relevance detection (no tool should be called) -----
    {
      id: "no-tool-needed",
      category: "relevance",
      tools: [
        {
          name: "calculate",
          description: "Perform a mathematical calculation",
          parameters: {
            type: "object",
            properties: {
              expression: { type: "string", description: "Math expression" },
            },
            required: ["expression"],
          },
        },
      ],
      prompt: "What is the capital of France?",
      expected: [],
    },

    // ----- Required fields -----
    {
      id: "required-fields",
      category: "required",
      tools: [
        {
          name: "book_flight",
          description: "Book a flight between cities",
          parameters: {
            type: "object",
            properties: {
              origin: { type: "string", description: "Departure city airport code" },
              destination: { type: "string", description: "Arrival city airport code" },
              date: { type: "string", description: "Travel date YYYY-MM-DD" },
              class: {
                type: "string",
                description: "Travel class",
                enum: ["economy", "business", "first"],
              },
              passengers: {
                type: "integer",
                description: "Number of passengers",
              },
            },
            required: ["origin", "destination", "date"],
          },
        },
      ],
      prompt: "Book a business class flight from SFO to JFK on 2026-04-15 for 2 passengers.",
      expected: [
        {
          name: "book_flight",
          arguments: {
            origin: "SFO",
            destination: "JFK",
            date: "2026-04-15",
            class: "business",
            passengers: 2,
          },
        },
      ],
    },
  ],
};
