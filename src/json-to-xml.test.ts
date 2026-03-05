import { describe, it, expect } from "vitest";
import { jsonToXml } from "./json-to-xml.js";

describe("jsonToXml", () => {
  it("converts a flat object", () => {
    const xml = jsonToXml({ status: "ok", count: 3 });
    expect(xml).toContain("<result>");
    expect(xml).toContain("<status>ok</status>");
    expect(xml).toContain("<count>3</count>");
    expect(xml).toContain("</result>");
  });

  it("converts arrays to <item> elements", () => {
    const xml = jsonToXml({ files: ["a.ts", "b.ts"] });
    expect(xml).toContain("<files>");
    expect(xml).toContain("<item>a.ts</item>");
    expect(xml).toContain("<item>b.ts</item>");
    expect(xml).toContain("</files>");
  });

  it("handles nested objects", () => {
    const xml = jsonToXml({
      user: { name: "Alice", age: 30 },
    });
    expect(xml).toContain("<user>");
    expect(xml).toContain("<name>Alice</name>");
    expect(xml).toContain("<age>30</age>");
    expect(xml).toContain("</user>");
  });

  it("handles null values with self-closing tags", () => {
    const xml = jsonToXml({ value: null });
    expect(xml).toContain("<value/>");
  });

  it("escapes special characters", () => {
    const xml = jsonToXml({ query: "a < b & c > d" });
    expect(xml).toContain("a &lt; b &amp; c &gt; d");
  });

  it("uses custom result root", () => {
    const xml = jsonToXml({ ok: true }, { resultRoot: "browser_result" });
    expect(xml).toContain("<browser_result>");
    expect(xml).toContain("</browser_result>");
  });

  it("handles empty arrays", () => {
    const xml = jsonToXml({ items: [] });
    expect(xml).toContain("<items/>");
  });

  it("handles array of objects", () => {
    const xml = jsonToXml({
      users: [
        { name: "Alice", role: "admin" },
        { name: "Bob", role: "user" },
      ],
    });
    expect(xml).toContain("<users>");
    expect(xml).toContain("<item>");
    expect(xml).toContain("<name>Alice</name>");
    expect(xml).toContain("<name>Bob</name>");
    expect(xml).toContain("</users>");
  });
});
