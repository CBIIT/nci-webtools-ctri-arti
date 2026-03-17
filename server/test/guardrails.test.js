import assert from "node:assert";
import { test } from "node:test";

import db, { Guardrail } from "database";
import { eq } from "drizzle-orm";
import { deleteGuardrailById, listGuardrails, toRuntimeGuardrailConfig } from "gateway/guardrails.js";

test("guardrail seed data is available to gateway management", async () => {
  const guardrails = await listGuardrails();
  assert.ok(guardrails.length >= 1, "Expected at least one seeded guardrail");

  const fedPulseGuardrail = guardrails.find((guardrail) => guardrail.name === "FedPulse Prompt Attack");
  assert.ok(fedPulseGuardrail, "FedPulse guardrail should be seeded");
  assert.equal(fedPulseGuardrail.awsGuardrailId, null);
  assert.equal(toRuntimeGuardrailConfig(fedPulseGuardrail), null);
});

test("deleteGuardrailById refuses to delete assigned guardrails", async () => {
  const [fedPulseGuardrail] = await db
    .select()
    .from(Guardrail)
    .where(eq(Guardrail.id, 1))
    .limit(1);
  assert.ok(fedPulseGuardrail, "FedPulse guardrail should exist");

  await assert.rejects(() => deleteGuardrailById(fedPulseGuardrail.id), (error) => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /still assigned/i);
    return true;
  });
});
