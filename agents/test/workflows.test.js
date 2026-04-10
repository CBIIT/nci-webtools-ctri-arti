import assert from "node:assert/strict";
import { describe, it } from "node:test";

import JSZip from "jszip";

import { getWorkflow, listWorkflows, runWorkflow } from "../workflows/index.js";
import { loadProtocolAdvisorAssets } from "../workflows/protocol-advisor/load-assets.js";
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

  it("registers protocol_advisor in the workflow registry", () => {
    assert.ok(listWorkflows().includes("protocol_advisor"));
    assert.ok(getWorkflow("protocol_advisor"));
  });

  it("loads the protocol advisor reference corpus and selected template", async () => {
    const assets = await loadProtocolAdvisorAssets({
      input: {
        templateId: "secondary_research",
      },
      options: {},
    });

    assert.equal(assets.selectedTemplate.id, "secondary_research");
    assert.equal(assets.sources.length, 29);
    assert.ok(assets.sources.some((source) => source.id === "45-cfr-part-46"));
    assert.ok(assets.sources.some((source) => source.id === "secondary_research"));
    assert.ok(assets.prompts.system.includes("You are Protocol Advisor"));
    assert.ok(assets.prompts.sourceReviewSchema.includes('"task_type"'));
  });

  it("runs the protocol advisor workflow end to end and emails a final DOCX report", async () => {
    const calls = [];
    const sent = [];

    const gateway = {
      invoke: async (params) => {
        calls.push(params);

        if (params.type === "workflow-protocol_advisor-final_report") {
          assert.match(params.messages[0].content[0].text, /"contradiction_review"/);
          return {
            output: {
              message: {
                content: [
                  {
                    text: [
                      "# EXECUTIVE SUMMARY: IRB REGULATORY COMPLIANCE REVIEW",
                      "",
                      "**Protocol:** Synthetic protocol",
                      "**Sponsor:** Test sponsor",
                      "**Overall Disposition:** clarification_required",
                      "",
                      "## STUDY OVERVIEW",
                      "",
                      "Synthetic study overview.",
                      "",
                      "## REGULATORY COMPLIANCE ASSESSMENT",
                      "",
                      "Short assessment.",
                      "",
                      "## KEY FINDINGS",
                      "",
                      "- Missing consent detail.",
                      "",
                      "## COMPLIANCE CATEGORY ANALYSIS",
                      "",
                      "Consent issues are the main concern.",
                      "",
                      "## RECOMMENDATIONS FOR PROTOCOL ENHANCEMENT",
                      "",
                      "- Expand consent procedures.",
                      "",
                      "## CONCLUSION",
                      "",
                      "Clarification required.",
                      "",
                      "## COMPREHENSIVE DEFICIENCY ANALYSIS",
                      "",
                      "### Tier 1",
                      "",
                      "- **Consent detail missing**",
                    ].join("\n"),
                  },
                ],
              },
            },
            usage: { inputTokens: 10, outputTokens: 10 },
            metrics: { latencyMs: 1 },
          };
        }

        if (params.type === "workflow-protocol_advisor-contradiction_review") {
          return {
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      overallSummary: "No contradictions identified.",
                      documentClean: true,
                      findings: [],
                      citations: [],
                    }),
                  },
                ],
              },
            },
            usage: { inputTokens: 10, outputTokens: 10 },
            metrics: { latencyMs: 1 },
          };
        }

        const userText = params.messages[0].content[0].text;

        if (userText.includes("REFERENCE SOURCE\n- id: 45-cfr-part-46")) {
          return {
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      task_type: "source_review",
                      summary: "Consent detail is incomplete.",
                      source_review: {
                        applies: true,
                        applicability_reason: "Applies to human subjects research.",
                        review_basis: "mixed",
                        review_basis_reason: "Federal review with current-gap framing.",
                        verdict: "insufficient_evidence",
                        findings: [
                          {
                            finding_id: "finding-1",
                            category_id: "consent_and_documentation",
                            citation: "45 CFR 46.116",
                            status: "insufficient_evidence",
                            issue_title: "Consent detail missing",
                            source_excerpt: "Informed consent must include required elements.",
                            subject_evidence:
                              "The protocol mentions consent but omits procedural detail.",
                            analysis: "The protocol does not clearly describe the consent process.",
                            required_action: "Add explicit consent-process detail and timing.",
                          },
                        ],
                      },
                    }),
                  },
                ],
              },
            },
            usage: { inputTokens: 10, outputTokens: 10 },
            metrics: { latencyMs: 1 },
          };
        }

        if (userText.includes("REFERENCE SOURCE\n- id: secondary_research")) {
          return {
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      task_type: "source_review",
                      summary: "Template content is thin.",
                      source_review: {
                        applies: true,
                        applicability_reason: "Selected template for this run.",
                        review_basis: "current_gap",
                        review_basis_reason: "Template completeness benchmark.",
                        verdict: "conditional_gap",
                        findings: [
                          {
                            finding_id: "finding-2",
                            category_id: "template_completeness",
                            citation: "Template section on data use",
                            status: "conditional_gap",
                            issue_title: "Template detail weak",
                            source_excerpt: "Describe data and specimen handling.",
                            subject_evidence: "Only brief data language is present.",
                            analysis: "The protocol is thin relative to the selected template.",
                            required_action: "Expand the data/specimen handling section.",
                          },
                        ],
                      },
                    }),
                  },
                ],
              },
            },
            usage: { inputTokens: 10, outputTokens: 10 },
            metrics: { latencyMs: 1 },
          };
        }

        return {
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    task_type: "source_review",
                    summary: "Source not applicable.",
                    source_review: {
                      applies: false,
                      applicability_reason: "Not implicated by the protocol.",
                      review_basis: "mixed",
                      review_basis_reason: "No triggered obligations.",
                      verdict: "not_applicable",
                      findings: [],
                    },
                  }),
                },
              ],
            },
          },
          usage: { inputTokens: 10, outputTokens: 10 },
          metrics: { latencyMs: 1 },
        };
      },
    };

    const result = await runWorkflow(
      "protocol_advisor",
      {
        templateId: "secondary_research",
        protocolText: "1 PROTOCOL SUMMARY\nSynthetic protocol text",
      },
      {
        services: {
          gateway,
          userId: 42,
          requestId: "req-test-1",
          users: {
            getUser: async (userId) => ({
              id: userId,
              email: "reviewer@example.org",
            }),
          },
          sendEmail: async (payload) => {
            sent.push(payload);
          },
        },
      }
    );

    assert.equal(
      calls.filter((call) => call.type === "workflow-protocol_advisor-source_review").length,
      29
    );
    assert.equal(
      calls.filter((call) => call.type === "workflow-protocol_advisor-contradiction_review").length,
      1
    );
    assert.equal(
      calls.filter((call) => call.type === "workflow-protocol_advisor-final_report").length,
      1
    );
    assert.equal(result.output.delivery.status, "sent");
    assert.equal(result.output.delivery.recipient, "reviewer@example.org");
    assert.equal(result.output.status, "clarification_required");
    assert.equal(result.output.mergedReview.overall_disposition.code, "clarification_required");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].attachments.length, 1);
    assert.match(sent[0].attachments[0].filename, /\.docx$/);

    const zip = await JSZip.loadAsync(sent[0].attachments[0].content);
    const documentXml = await zip.file("word/document.xml").async("string");
    assert.match(documentXml, /EXECUTIVE SUMMARY: IRB REGULATORY COMPLIANCE REVIEW/);
    assert.match(documentXml, /Protocol:/);
    assert.match(documentXml, /Overall Disposition:/);
    assert.match(documentXml, /Consent detail missing/);
  });

  it("merges multiple input files into one cached protocol body", async () => {
    let firstSystemPrompt = null;

    const gateway = {
      invoke: async (params) => {
        if (params.type === "workflow-protocol_advisor-source_review" && !firstSystemPrompt) {
          firstSystemPrompt = params.system;
        }

        if (params.type === "workflow-protocol_advisor-contradiction_review") {
          return {
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      overallSummary: "No contradictions identified.",
                      documentClean: true,
                      findings: [],
                      citations: [],
                    }),
                  },
                ],
              },
            },
            usage: { inputTokens: 1, outputTokens: 1 },
            metrics: { latencyMs: 1 },
          };
        }

        if (params.type === "workflow-protocol_advisor-final_report") {
          return {
            output: {
              message: {
                content: [{ text: "# EXECUTIVE SUMMARY: IRB REGULATORY COMPLIANCE REVIEW\n" }],
              },
            },
            usage: { inputTokens: 1, outputTokens: 1 },
            metrics: { latencyMs: 1 },
          };
        }

        return {
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    task_type: "source_review",
                    summary: "Source not applicable.",
                    source_review: {
                      applies: false,
                      applicability_reason: "Not implicated by the protocol.",
                      review_basis: "mixed",
                      review_basis_reason: "No triggered obligations.",
                      verdict: "not_applicable",
                      findings: [],
                    },
                  }),
                },
              ],
            },
          },
          usage: { inputTokens: 1, outputTokens: 1 },
          metrics: { latencyMs: 1 },
        };
      },
    };

    const result = await runWorkflow(
      "protocol_advisor",
      {
        templateId: "repository",
        documents: [
          {
            name: "first.txt",
            bytes: Buffer.from("First file body", "utf8").toString("base64"),
            contentType: "text/plain",
          },
          {
            name: "second.txt",
            bytes: Buffer.from("Second file body", "utf8").toString("base64"),
            contentType: "text/plain",
          },
        ],
      },
      {
        services: {
          gateway,
        },
      }
    );

    assert.match(firstSystemPrompt, /FILE 1: first\.txt/);
    assert.match(firstSystemPrompt, /First file body/);
    assert.match(firstSystemPrompt, /FILE 2: second\.txt/);
    assert.match(firstSystemPrompt, /Second file body/);
    assert.equal(result.output.protocol.files.length, 2);
    assert.equal(result.output.delivery.status, "recipient_unavailable");
  });
});
