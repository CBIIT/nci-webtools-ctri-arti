import assert from "/test/assert.js";
import { apiJson as api, createApiHeaders } from "/test/helpers.js";

export const SCRIPTED_MODEL = "scripted-model";

export function assertISODate(value, label) {
  assert.strictEqual(typeof value, "string", `${label} should be a string`);
  assert.ok(!isNaN(Date.parse(value)), `${label} should be a valid ISO date`);
}

export function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getSmokeTestUser() {
  const { status, json } = await api("GET", "/session");
  assert.strictEqual(status, 200);
  assert.ok(json.user, "session should contain user");
  assert.ok(json.user.id, "user should have id");
  assert.ok(json.user.email, "user should have email");
  return json.user;
}

export async function invokeScriptedModel({ text, stream = false, type }) {
  const res = await fetch("/api/v1/model/invoke", {
    method: "POST",
    headers: createApiHeaders(),
    body: JSON.stringify({
      model: SCRIPTED_MODEL,
      messages: [{ role: "user", content: [{ text }] }],
      stream,
      ...(type ? { type } : {}),
    }),
  });

  return res;
}
