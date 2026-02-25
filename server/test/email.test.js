import assert from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import Handlebars from "handlebars";

test("email template", async (t) => {
  const templatePath = new URL("../templates/error-log-report.hbs", import.meta.url);

  await t.test("template file can be read and compiled", async () => {
    const source = await readFile(templatePath, "utf8");
    assert.ok(source.length > 0, "Template file should not be empty");

    const template = Handlebars.compile(source, { strict: true });
    assert.strictEqual(typeof template, "function");
  });

  await t.test("template renders with valid data", async () => {
    const source = await readFile(templatePath, "utf8");
    const template = Handlebars.compile(source, { strict: true });

    const html = template({
      timestamp: "2024-01-15 10:30:00",
      userId: "123",
      userName: "Test User",
      version: "1.0.0",
      isUserReported: false,
      detailRows: [
        { label: "Error", value: "Something failed", isMultiline: false },
      ],
    });

    assert.ok(html.includes("Test User"));
    assert.ok(html.includes("Something failed"));
    assert.ok(html.includes("2024-01-15"));
  });

  await t.test("template renders user-reported variant", async () => {
    const source = await readFile(templatePath, "utf8");
    const template = Handlebars.compile(source, { strict: true });

    const html = template({
      timestamp: "2024-01-15 10:30:00",
      userId: "456",
      userName: "Reporter",
      version: null,
      isUserReported: true,
      detailRows: [],
    });

    assert.ok(html.length > 0);
  });
});
