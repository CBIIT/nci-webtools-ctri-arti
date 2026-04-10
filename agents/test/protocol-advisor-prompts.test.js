import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateProtocolAdvisorReport } from "../workflows/protocol-advisor/aggregate-report.js";
import {
  executeProtocolAdvisorContradictionReview,
  splitTextIntoSections,
  buildContradictionReviewInput,
} from "../workflows/protocol-advisor/execute-contradiction-review.js";
import { synthesizeProtocolAdvisorFinalReport } from "../workflows/protocol-advisor/synthesize-final-report.js";

describe("protocol advisor contradiction review", () => {
  describe("splitTextIntoSections", () => {
    it("splits text into sections by numbered headings", () => {
      const sections = splitTextIntoSections(
        [
          "1 STUDY POPULATION",
          "We will enroll 40 participants.",
          "10 STATISTICS",
          "The study will enroll 60 participants.",
        ].join("\n")
      );

      assert.equal(sections.length, 2);
      assert.equal(sections[0].detectedTitle, "STUDY POPULATION");
      assert.equal(sections[0].detectedSectionId, "1");
      assert.equal(sections[0].sourceOrder, 0);
      assert.equal(sections[1].detectedTitle, "STATISTICS");
      assert.equal(sections[1].detectedSectionId, "10");
      assert.equal(sections[1].sourceOrder, 1);
    });

    it("tracks page markers from PDF-parsed text", () => {
      const sections = splitTextIntoSections(
        [
          "Page 1:",
          "1 INTRODUCTION",
          "This is the intro.",
          "Page 5:",
          "2 STUDY DESIGN",
          "This is the design.",
          "Page 12:",
          "3 ELIGIBILITY",
          "Inclusion criteria here.",
        ].join("\n")
      );

      assert.equal(sections.length, 3);
      assert.equal(sections[0].detectedTitle, "INTRODUCTION");
      assert.equal(sections[0].pageStart, 1);
      assert.equal(sections[1].detectedTitle, "STUDY DESIGN");
      assert.equal(sections[1].pageStart, 5);
      assert.equal(sections[2].detectedTitle, "ELIGIBILITY");
      assert.equal(sections[2].pageStart, 12);
    });

    it("returns null pageStart when no page markers are present", () => {
      const sections = splitTextIntoSections("1 OBJECTIVES\nThe primary objective is...");

      assert.equal(sections.length, 1);
      assert.equal(sections[0].pageStart, null);
    });

    it("returns an implicit section for text with no headings", () => {
      const sections = splitTextIntoSections("Just some plain text here.");

      assert.equal(sections.length, 1);
      assert.equal(sections[0].detectedTitle, "Document Start");
      assert.equal(sections[0].headingKind, "implicit");
      assert.equal(sections[0].rawContent, "Just some plain text here.");
    });
  });

  describe("buildContradictionReviewInput", () => {
    it("builds structured input from parsed protocol", () => {
      const input = buildContradictionReviewInput({
        source: "document",
        contentType: "application/pdf",
        text: [
          "Page 3:",
          "1 STUDY POPULATION",
          "We will enroll 40 participants.",
          "Page 8:",
          "10 STATISTICS",
          "Sample size is 60.",
        ].join("\n"),
      });

      assert.equal(input.protocol.source, "document");
      assert.equal(input.protocol.contentType, "application/pdf");
      assert.equal(input.protocol.candidateSectionCount, 2);
      assert.equal(input.sections.length, 2);
      assert.equal(input.sections[0].detectedTitle, "STUDY POPULATION");
      assert.equal(input.sections[0].pageStart, 3);
      assert.equal(input.sections[1].detectedTitle, "STATISTICS");
      assert.equal(input.sections[1].pageStart, 8);
    });
  });

  describe("executor and parser", () => {
    it("normalizes contradiction review output defensively", async () => {
      const result = await executeProtocolAdvisorContradictionReview(
        {
          workflow: { runId: "run-1" },
          steps: {
            loadAssets: {
              model: "test-model",
              prompts: {
                contradictionReviewSystem: "system prompt",
                contradictionReviewUser: "Input\n{{input_json}}\nOutput\n{{output_json_example}}",
              },
            },
            parseProtocol: {
              source: "protocolText",
              contentType: "text/plain",
              text: [
                "1 STUDY POPULATION",
                "We will enroll 40 participants.",
                "10 STATISTICS",
                "The study will enroll 60 participants.",
              ].join("\n"),
            },
          },
        },
        {
          gateway: {
            invoke: async () => ({
              output: {
                message: {
                  content: [
                    {
                      text: JSON.stringify({
                        overallSummary: "Found one contradiction.",
                        documentClean: true,
                        findings: [
                          {
                            category: "enrollment_sample_size",
                            severity: "urgent",
                            concept: "Target enrollment",
                            sectionA: {
                              sectionTitle: "Study Population",
                              sectionId: "1",
                              page: 3,
                              quote: "We will enroll 40 participants.",
                            },
                            sectionB: {
                              sectionTitle: "Statistics",
                              sectionId: "10",
                              quote: "The study will enroll 60 participants.",
                            },
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
              usage: { inputTokens: 1, outputTokens: 1 },
              metrics: { latencyMs: 1 },
            }),
          },
        }
      );

      assert.equal(result.status, "completed");
      assert.equal(result.output.overallSummary, "Found one contradiction.");
      assert.equal(result.output.documentClean, false);
      assert.equal(result.output.findings.length, 1);
      assert.equal(result.output.findings[0].severity, "medium");
      assert.equal(result.output.findings[0].sectionA.sectionId, "1");
      assert.equal(result.output.findings[0].sectionA.page, 3);
      assert.equal(result.output.findings[0].sectionB.sectionTitle, "Statistics");
      assert.equal(result.output.findings[0].sectionB.page, null);
    });
  });

  describe("aggregate report", () => {
    it("surfaces contradiction review results with page references", () => {
      const report = aggregateProtocolAdvisorReport({
        steps: {
          loadAssets: {
            workflowName: "protocol_advisor",
            workflowId: "protocol_advisor",
            selectedTemplate: {
              id: "secondary_research",
              title: "Secondary Research",
            },
            categories: [],
          },
          parseProtocol: {
            name: "Synthetic Protocol",
            source: "document",
            files: [],
          },
          executeSourceReviews: {
            results: [],
          },
          executeContradictionReview: {
            status: "completed",
            output: {
              overallSummary: "One contradiction identified.",
              documentClean: false,
              findings: [
                {
                  category: "eligibility_criteria",
                  severity: "high",
                  concept: "Age range",
                  sectionA: {
                    sectionTitle: "Eligibility",
                    sectionId: "5.1",
                    page: 14,
                    quote: "Participants must be 18 years or older.",
                  },
                  sectionB: {
                    sectionTitle: "Summary",
                    sectionId: "1.0",
                    page: 2,
                    quote: "Participants aged 16 and older may enroll.",
                  },
                  explanation: "Two sections describe different minimum ages.",
                  resolutionGuidance:
                    "Reconcile the age eligibility language in Section 5.1 and Section 1.0.",
                },
              ],
            },
          },
        },
      });

      assert.equal(report.contradictionReview.status, "completed");
      assert.equal(report.contradictionReview.documentClean, false);
      assert.equal(report.contradictionReview.findings.length, 1);
      assert.equal(report.contradictionReview.findings[0].concept, "Age range");
      assert.match(report.audit_report_markdown, /INTERNAL CONTRADICTIONS REVIEW/);
      assert.match(report.audit_report_markdown, /p\. 14/);
      assert.match(report.audit_report_markdown, /p\. 2/);
    });
  });

  describe("final synthesis", () => {
    it("passes contradiction review data into final synthesis", async () => {
      let finalPrompt = null;

      await synthesizeProtocolAdvisorFinalReport(
        {
          workflow: { runId: "run-2" },
          steps: {
            loadAssets: {
              workflowId: "protocol_advisor",
              workflowName: "Protocol Advisor",
              model: "test-model",
              prompts: {
                finalReport: "MERGED REVIEW JSON\n{{merged_json}}",
              },
            },
            executeSourceReviews: {
              systemPrompt: "source system",
            },
            aggregateReport: {
              subject_id: "Synthetic Protocol",
              subject_path: "Synthetic Protocol",
              template: {
                templateId: "secondary_research",
              },
              overall_disposition: {
                code: "no_material_gaps_identified",
                recommendation: "No material gaps identified in the reviewed source set.",
              },
              source_verdicts: [],
              findings_by_category: [],
              contradictionReview: {
                status: "completed",
                overallSummary: "One contradiction identified.",
                documentClean: false,
                findings: [
                  {
                    category: "eligibility_criteria",
                    severity: "high",
                    concept: "Age range",
                    sectionA: {
                      sectionTitle: "Eligibility",
                      sectionId: "5.1",
                      page: 14,
                      quote: "Participants must be 18 years or older.",
                    },
                    sectionB: {
                      sectionTitle: "Summary",
                      sectionId: "1.0",
                      page: 2,
                      quote: "Participants aged 16 and older may enroll.",
                    },
                    explanation: "Two sections describe different minimum ages.",
                    resolutionGuidance:
                      "Reconcile the age eligibility language in Section 5.1 and Section 1.0.",
                  },
                ],
              },
            },
          },
        },
        {
          gateway: {
            invoke: async (params) => {
              finalPrompt = params.messages[0].content[0].text;
              return {
                output: {
                  message: {
                    content: [{ text: "# Final report" }],
                  },
                },
                usage: { inputTokens: 1, outputTokens: 1 },
                metrics: { latencyMs: 1 },
              };
            },
          },
        }
      );

      assert.match(finalPrompt, /"contradiction_review"/);
      assert.match(finalPrompt, /"Age range"/);
    });
  });
});
