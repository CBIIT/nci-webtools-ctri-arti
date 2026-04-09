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

  it("registers protocol_advisor in the workflow registry", async () => {
    assert.ok(listWorkflows().includes("protocol_advisor"));
    assert.ok(getWorkflow("protocol_advisor"));

    const result = await runWorkflow("protocol_advisor", {
      templateId: "interventional",
      protocolText: "1 PROTOCOL SUMMARY\nIntro text\n\n3 OBJECTIVES AND ENDPOINTS\nObjective text",
    });

    assert.equal(result.output.status, "review_plan_ready");
    assert.equal(result.output.template.templateId, "interventional");
    assert.ok(result.output.protocol.candidateSectionCount >= 2);
    assert.ok(result.output.sections.length > 10);
    assert.ok(result.output.summary.countsByStatus.missing > 0);
    assert.ok(result.output.reviewPlan.modelReviewSectionCount > 0);
    assert.ok(result.output.reviewPlan.promptTaskCount > 0);
    assert.ok(result.output.promptPlan.some((task) => task.scope === "document"));
    assert.ok(result.output.promptExecution.summary.countsByStatus.pending_model_review > 0);
    assert.equal(result.output.focusAreas.length, 6);
    assert.equal(result.output.delivery.status, "recipient_unavailable");
    assert.equal(result.context.workflow.name, "protocol_advisor");
  });

  it("includes all seeded protocol advisor template families", async () => {
    const assets = await loadProtocolAdvisorAssets({
      input: {
        templateId: "secondary_research",
      },
    });

    assert.deepEqual(assets.templateIds.sort(), [
      "behavioral_social_science",
      "interventional",
      "natural_history_observational",
      "prospective_data_collection",
      "repository",
      "retrospective_review",
      "secondary_research",
    ]);
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
    assert.equal(protocolSummary.review.mode, "model_required");
    assert.equal(biospecimens.status, "missing");
    assert.equal(biospecimens.review.mode, "deterministic");
    assert.equal(result.output.summary.templateCompleteness.missingSectionCount > 0, true);
    assert.ok(
      result.output.summary.templateCompleteness.requiredSections.some(
        (section) =>
          section.sectionName === "BIOSPECIMENS AND/OR DATA" && section.status === "Missing"
      )
    );
    assert.ok(
      result.output.summary.templateCompleteness.findings.some(
        (finding) =>
          finding.sectionName === "BIOSPECIMENS AND/OR DATA" && finding.issueType === "missing"
      )
    );
    assert.ok(
      result.output.promptPlan.some(
        (task) =>
          task.scope === "section" &&
          task.section?.templateSectionTitle === "PROTOCOL SUMMARY" &&
          task.promptId === "section_review"
      )
    );
    assert.ok(
      result.output.promptExecution.results.some(
        (result) =>
          result.promptId === "section_review" &&
          result.status === "pending_model_review" &&
          result.target?.templateSectionTitle === "PROTOCOL SUMMARY"
      )
    );
    assert.equal(
      result.output.promptPlan.some(
        (task) =>
          task.scope === "section" &&
          task.section?.templateSectionTitle === "BIOSPECIMENS AND/OR DATA"
      ),
      false
    );
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
    assert.equal(biospecimens.status, "placeholder");
    assert.equal(biospecimens.review.mode, "deterministic");
    assert.ok(
      result.output.summary.templateCompleteness.findings.some(
        (finding) =>
          finding.sectionName === "BIOSPECIMENS AND/OR DATA" && finding.issueType === "placeholder"
      )
    );
    assert.ok(Array.isArray(result.output.focusAreas));
  });

  it("flags blank matched sections", async () => {
    const result = await runWorkflow("protocol_advisor", {
      templateId: "secondary_research",
      protocolText: ["PROTOCOL SUMMARY", "", "2 INTRODUCTION", "Background text"].join("\n"),
    });

    const protocolSummary = result.output.sections.find(
      (section) => section.templateSectionTitle === "PROTOCOL SUMMARY"
    );

    assert.equal(protocolSummary.status, "blank");
    assert.equal(protocolSummary.review.mode, "deterministic");
    assert.ok(
      result.output.summary.templateCompleteness.findings.some(
        (finding) => finding.sectionName === "PROTOCOL SUMMARY" && finding.issueType === "blank"
      )
    );
  });

  it("excludes optional template sections from missing-deficiency reporting", async () => {
    const result = await runWorkflow("protocol_advisor", {
      templateId: "interventional",
      protocolText: "1 PROTOCOL SUMMARY\nShort summary text",
    });

    const optionalSection = result.output.sections.find(
      (section) => section.templateSectionRequired === false
    );

    assert.ok(optionalSection, "Expected at least one optional section in the template");
    assert.equal(optionalSection.templateSectionRequired, false);
    assert.equal(optionalSection.status, "optional");
    assert.equal(
      result.output.summary.templateCompleteness.requiredSections.some(
        (section) => section.sectionName === optionalSection.templateSectionTitle
      ),
      false
    );
    assert.equal(
      result.output.summary.templateCompleteness.findings.some(
        (finding) => finding.sectionName === optionalSection.templateSectionTitle
      ),
      false
    );
    assert.equal(
      result.output.summary.missingSections.some(
        (section) => section.templateSectionTitle === optionalSection.templateSectionTitle
      ),
      false
    );
  });

  it("executes section review prompts through the gateway when available", async () => {
    const calls = [];
    const gateway = {
      invoke: async (params) => {
        calls.push(params);
        if (params.type === "workflow-section_review") {
          return {
            output: {
              message: {
                content: [
                  {
                    text: JSON.stringify({
                      status: "insufficient",
                      feedback: "Add more detail about the protocol summary.",
                      issues: [
                        {
                          type: "insufficient",
                          message: "Summary is too short.",
                          requiredContent: "Add design, objectives, and endpoints.",
                          citations: [],
                        },
                      ],
                      focusAreas: ["risk_benefit_assessment"],
                      citations: [],
                    }),
                  },
                ],
              },
            },
          };
        }

        return {
          output: {
            message: {
              content: [
                {
                  text: JSON.stringify({
                    overallSummary:
                      "The protocol has one reviewed section and several missing sections.",
                    prioritizedNextSteps: ["Complete the remaining required sections."],
                    groupedThemes: [
                      {
                        title: "Coverage Gaps",
                        summary: "Several required sections are still missing.",
                        sectionTitles: ["BIOSPECIMENS AND/OR DATA"],
                      },
                    ],
                    focusAreas: [
                      {
                        id: "risk_minimization",
                        summary: "Safety and risk controls need strengthening.",
                        sectionTitles: ["STUDY DESIGN"],
                      },
                      {
                        id: "risk_benefit_assessment",
                        summary: "Benefits and burden should be rebalanced.",
                        sectionTitles: ["PROTOCOL SUMMARY"],
                      },
                      {
                        id: "equitable_selection",
                        summary: "Selection criteria need more justification.",
                        sectionTitles: ["STUDY POPULATION"],
                      },
                      {
                        id: "informed_consent",
                        summary: "Consent details need clarification.",
                        sectionTitles: ["INFORMED CONSENT"],
                      },
                      {
                        id: "privacy_confidentiality",
                        summary: "Data handling protections need clarification.",
                        sectionTitles: ["BIOSPECIMENS AND/OR DATA"],
                      },
                      {
                        id: "vulnerable_population_safeguards",
                        summary: "Safeguards for vulnerable groups need strengthening.",
                        sectionTitles: ["STUDY POPULATION"],
                      },
                    ],
                    citations: [],
                  }),
                },
              ],
            },
          },
        };
      },
    };

    const result = await runWorkflow(
      "protocol_advisor",
      {
        templateId: "secondary_research",
        protocolText: "1 PROTOCOL SUMMARY\nShort summary text",
      },
      {
        services: {
          gateway,
          userId: 1,
          requestId: "req-test-1",
        },
      }
    );

    const sectionReview = result.output.promptExecution.results.find(
      (promptResult) =>
        promptResult.promptId === "section_review" &&
        promptResult.target?.templateSectionTitle === "PROTOCOL SUMMARY"
    );
    const documentOverview = result.output.promptExecution.results.find(
      (promptResult) => promptResult.promptId === "document_overview"
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].model, "us.anthropic.claude-haiku-4-5-20251001-v1:0");
    assert.equal(calls[1].model, "us.anthropic.claude-haiku-4-5-20251001-v1:0");
    assert.match(calls[0].system, /Return only a single JSON object/);
    assert.match(calls[0].messages[0].content[0].text, /Return JSON with this shape:/);
    assert.match(calls[0].messages[0].content[0].text, /templateSectionGuidanceText/);
    assert.match(
      calls[0].messages[0].content[0].text,
      /Provide a short description of the protocol/
    );
    assert.match(calls[1].system, /review the protocol as a whole/i);
    assert.match(
      calls[1].messages[0].content[0].text,
      /Review this protocol at the whole-document level/
    );
    assert.equal(sectionReview.status, "completed");
    assert.equal(sectionReview.output.status, "insufficient");
    assert.match(sectionReview.output.feedback, /Add more detail/);
    assert.deepEqual(sectionReview.output.focusAreas, ["risk_benefit_assessment"]);
    assert.ok(
      result.output.summary.templateCompleteness.findings.some(
        (finding) =>
          finding.sectionName === "PROTOCOL SUMMARY" && finding.issueType === "insufficient"
      )
    );
    assert.equal(documentOverview.status, "completed");
    assert.match(documentOverview.output.overallSummary, /one reviewed section/);
    assert.equal(result.output.focusAreas.length, 6);
    assert.match(
      result.output.focusAreas.find((area) => area.id === "risk_minimization").summary,
      /Safety and risk controls/
    );
  });

  it("sends delivery metadata to the authenticated requester account", async () => {
    const sent = [];
    const result = await runWorkflow(
      "protocol_advisor",
      {
        templateId: "secondary_research",
        protocolText: "1 PROTOCOL SUMMARY\nShort summary text",
      },
      {
        services: {
          userId: 42,
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

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "reviewer@example.org");
    assert.match(sent[0].subject, /Protocol Advisor Results/);
    assert.equal(sent[0].attachments?.length, 1);
    assert.equal(sent[0].attachments[0].filename, "protocol-advisor-summary-report.docx");
    assert.equal(
      sent[0].attachments[0].contentType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    const zip = await JSZip.loadAsync(sent[0].attachments[0].content);
    const documentXml = await zip.file("word/document.xml").async("string");
    assert.match(documentXml, /EXECUTIVE SUMMARY: IRB REGULATORY COMPLIANCE REVIEW/);
    assert.match(documentXml, /STUDY OVERVIEW/);
    assert.match(documentXml, /Immediate Priorities:/);
    assert.match(documentXml, /Regulatory Status Clarification:/);
    assert.match(documentXml, /Risk Management Enhancement:/);
    assert.match(documentXml, /Selection Criteria Review:/);
    assert.equal(result.output.delivery.status, "sent");
    assert.equal(result.output.delivery.recipient, "reviewer@example.org");
  });
});
