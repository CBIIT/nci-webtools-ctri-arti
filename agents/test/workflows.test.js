import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getWorkflow, listWorkflows, runWorkflow } from "../workflows/index.js";
import { getTopologicalOrder } from "../workflows/runtime/graph.js";
import { runWorkflowDefinition } from "../workflows/runtime/runner.js";

describe("workflows", () => {
  it("orders nodes topologically", () => {
    const order = getTopologicalOrder({
      name: "ordered",
      nodes: {
        a: { deps: [], run: async () => "a" },
        b: { deps: ["a"], run: async () => "b" },
        c: { deps: ["b"], run: async () => "c" },
      },
    });

    assert.deepEqual(order, ["a", "b", "c"]);
  });

  it("rejects cyclic workflows", () => {
    assert.throws(
      () =>
        getTopologicalOrder({
          name: "cyclic",
          nodes: {
            a: { deps: ["b"], run: async () => "a" },
            b: { deps: ["a"], run: async () => "b" },
          },
        }),
      /contains a cycle/
    );
  });

  it("runs nodes with shared context and output resolver", async () => {
    const result = await runWorkflowDefinition(
      {
        name: "sample",
        nodes: {
          load: {
            deps: [],
            run: async () => ({ value: 2 }),
          },
          double: {
            deps: ["load"],
            run: async (ctx) => ({ value: ctx.steps.load.value * 2 }),
          },
        },
        output(ctx) {
          return ctx.steps.double.value;
        },
      },
      { number: 2 }
    );

    assert.equal(result.output, 4);
    assert.equal(result.context.steps.load.value, 2);
    assert.equal(result.context.steps.double.value, 4);
    assert.equal(result.context.nodeResults.load.status, "completed");
  });

  it("supports skipped nodes via when()", async () => {
    const result = await runWorkflowDefinition(
      {
        name: "conditional",
        nodes: {
          always: {
            deps: [],
            run: async () => "always",
          },
          maybe: {
            deps: ["always"],
            when: async () => false,
            run: async () => "never",
          },
        },
      },
      {}
    );

    assert.equal(result.context.steps.always, "always");
    assert.equal(result.context.steps.maybe, null);
    assert.equal(result.context.nodeResults.maybe.status, "skipped");
  });

  it("registers protocol_advisor in the workflow registry", async () => {
    assert.ok(listWorkflows().includes("protocol_advisor"));
    assert.ok(getWorkflow("protocol_advisor"));

    const result = await runWorkflow("protocol_advisor", {
      templateId: "interventional",
      protocolText: "1 PROTOCOL SUMMARY\nIntro text\n\n3 OBJECTIVES AND ENDPOINTS\nObjective text",
    });

    assert.equal(result.output.status, "deterministic_review");
    assert.equal(result.output.template.templateId, "interventional");
    assert.ok(result.output.protocol.candidateSectionCount >= 2);
    assert.ok(result.output.sections.length > 10);
    assert.ok(result.output.summary.countsByStatus.missing > 0);
    assert.equal(result.context.workflow.name, "protocol_advisor");
  });

  it("extracts template sections and marks missing protocol sections", async () => {
    const result = await runWorkflow("protocol_advisor", {
      templateId: "secondary_research",
      protocolText: "1 PROTOCOL SUMMARY\nStudy summary",
    });

    const protocolSummary = result.output.sections.find(
      (section) => section.templateSectionTitle === "PROTOCOL SUMMARY"
    );
    const biospecimens = result.output.sections.find(
      (section) => section.templateSectionTitle === "BIOSPECIMENS AND/OR DATA"
    );

    assert.equal(protocolSummary.status, "ok");
    assert.equal(biospecimens.status, "missing");
  });

  it("matches known title aliases and flags placeholders", async () => {
    const result = await runWorkflow("protocol_advisor", {
      templateId: "secondary_research",
      protocolText: [
        "PROTOCOL SUMMARY",
        "Completed summary text",
        "",
        "BIOSPECIMENS AND DATA",
        "TBD",
      ].join("\n"),
    });

    const biospecimens = result.output.sections.find(
      (section) => section.templateSectionTitle === "BIOSPECIMENS AND/OR DATA"
    );

    assert.equal(biospecimens.matchStatus, "matched");
    assert.equal(biospecimens.rationale, "alias");
    assert.equal(biospecimens.status, "placeholder");
  });

  it("flags blank matched sections", async () => {
    const result = await runWorkflow("protocol_advisor", {
      templateId: "secondary_research",
      protocolText: ["PROTOCOL SUMMARY", "", "2 INTRODUCTION", "Background text"].join("\n"),
    });

    const protocolSummary = result.output.sections.find(
      (section) => section.templateSectionTitle === "PROTOCOL SUMMARY"
    );

    assert.equal(protocolSummary.matchStatus, "matched");
    assert.equal(protocolSummary.status, "blank");
  });
});
