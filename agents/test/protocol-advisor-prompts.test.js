import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { aggregateProtocolAdvisorReport } from "../workflows/protocol-advisor/aggregate-report.js";
import { executeConsentConsistencyReview } from "../workflows/protocol-advisor/execute-consent-consistency-review.js";
import { executeProtocolAdvisorContradictionReview } from "../workflows/protocol-advisor/execute-contradiction-review.js";
import { executeCrossDocComparison } from "../workflows/protocol-advisor/execute-cross-doc-comparison.js";
import { validateProtocolAdvisorInput } from "../workflows/protocol-advisor/input-schema.js";
import { synthesizeProtocolAdvisorFinalReport } from "../workflows/protocol-advisor/synthesize-final-report.js";
import {
  buildContradictionReviewInput,
  normalizeContradictionReviewPayload,
  splitTextIntoSections,
} from "../workflows/shared/contradiction-helpers.js";
import {
  buildCrossDocComparisonInput,
  normalizeCrossDocReviewPayload,
} from "../workflows/shared/cross-doc-helpers.js";

describe("protocol advisor contradiction review", () => {
  describe("input schema", () => {
    it("rejects singular document without bytes", () => {
      assert.throws(
        () =>
          validateProtocolAdvisorInput({
            templateId: "secondary_research",
            protocolText: "Protocol text",
            document: { name: "protocol.pdf" },
          }),
        /protocol_advisor document must include bytes when provided/
      );
    });

    it("rejects singular consentDocument without bytes", () => {
      assert.throws(
        () =>
          validateProtocolAdvisorInput({
            templateId: "secondary_research",
            protocolText: "Protocol text",
            consentDocument: { name: "consent.pdf" },
          }),
        /protocol_advisor consentDocument must include bytes when provided/
      );
    });

    it("accepts mirrored consent inputs when provided", () => {
      const validated = validateProtocolAdvisorInput({
        templateId: "secondary_research",
        protocolText: "Protocol text",
        consentText: "Consent text",
        consentDocument: {
          name: "consent.txt",
          bytes: Buffer.from("Consent file"),
          contentType: "text/plain",
        },
        consentDocuments: [
          {
            name: "consent-2.txt",
            bytes: Buffer.from("Consent file 2"),
            contentType: "text/plain",
          },
        ],
      });

      assert.equal(validated.hasConsentText, true);
      assert.equal(validated.hasConsentDocument, true);
      assert.equal(validated.hasConsentDocuments, true);
      assert.equal(validated.consentDocumentCount, 2);
    });
  });

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

      assert.equal(input.document.source, "document");
      assert.equal(input.document.contentType, "application/pdf");
      assert.equal(input.document.candidateSectionCount, 2);
      assert.equal(input.sections.length, 2);
      assert.equal(input.sections[0].detectedTitle, "STUDY POPULATION");
      assert.equal(input.sections[0].pageStart, 3);
      assert.equal(input.sections[1].detectedTitle, "STATISTICS");
      assert.equal(input.sections[1].pageStart, 8);
    });
  });

  describe("normalizeContradictionReviewPayload", () => {
    it("normalizes missing and malformed contradiction fields defensively", () => {
      const normalized = normalizeContradictionReviewPayload({
        findings: [
          {
            severity: "urgent",
            sectionA: {
              sectionTitle: "Section A",
              page: 4,
            },
            sectionB: {},
          },
        ],
      });

      assert.equal(normalized.documentClean, false);
      assert.equal(normalized.findings[0].severity, "medium");
      assert.equal(normalized.findings[0].sectionA.page, 4);
      assert.equal(normalized.findings[0].sectionB.page, null);
      assert.equal(normalized.findings[0].resolutionGuidance, "");
    });
  });

  describe("cross-document comparison", () => {
    it("builds structured input from parsed protocol and consent", () => {
      const input = buildCrossDocComparisonInput(
        {
          source: "protocolText",
          name: "protocol.pdf",
          contentType: "application/pdf",
          text: ["Page 2:", "1 RISKS", "Participants may experience minor or major bleeding."].join(
            "\n"
          ),
        },
        {
          source: "consentText",
          name: "consent-form.pdf",
          contentType: "application/pdf",
          text: ["Page 4:", "1 POSSIBLE RISKS", "You may have minor bruising."].join("\n"),
        }
      );

      assert.equal(input.protocol.source, "protocolText");
      assert.equal(input.protocol.fileName, "protocol.pdf");
      assert.equal(input.protocol.candidateSectionCount, 1);
      assert.equal(input.protocolSections[0].pageStart, 2);
      assert.equal(input.consent.source, "consentText");
      assert.equal(input.consent.fileName, "consent-form.pdf");
      assert.equal(input.consent.candidateSectionCount, 1);
      assert.equal(input.consentSections[0].pageStart, 4);
    });

    it("normalizes malformed cross-document fields defensively", () => {
      const normalized = normalizeCrossDocReviewPayload({
        findings: [
          {
            severity: "critical",
            protocol: { sectionTitle: "Risks" },
            consent: {},
          },
        ],
      });

      assert.equal(normalized.documentsAligned, false);
      assert.equal(normalized.findings[0].severity, "medium");
      assert.equal(normalized.findings[0].direction, "other");
      assert.equal(normalized.findings[0].likelyOutOfSync, "unclear");
      assert.equal(normalized.findings[0].protocol.page, null);
      assert.equal(normalized.findings[0].consent.fileName, "");
    });

    it("returns aligned result for empty findings", () => {
      const normalized = normalizeCrossDocReviewPayload(
        {},
        { emptySummary: "No cross-document discrepancies identified." }
      );

      assert.equal(normalized.documentsAligned, true);
      assert.equal(normalized.overallSummary, "No cross-document discrepancies identified.");
      assert.deepEqual(normalized.findings, []);
    });

    it("normalizes cross-document executor output defensively", async () => {
      const result = await executeCrossDocComparison(
        {
          workflow: { runId: "run-cross-doc-1" },
          steps: {
            loadAssets: {
              model: "test-model",
              prompts: {
                crossDocComparisonSystem: "system prompt",
                crossDocComparisonUser: "Input\n{{input_json}}\nOutput\n{{output_json_example}}",
              },
            },
            parseProtocol: {
              source: "protocolText",
              name: "protocol.pdf",
              contentType: "application/pdf",
              text: [
                "Page 22:",
                "9 RISKS",
                "Participants may experience minor or major bleeding.",
              ].join("\n"),
            },
            parseConsent: {
              source: "consentText",
              name: "consent-form.pdf",
              contentType: "application/pdf",
              text: ["Page 4:", "6 POSSIBLE RISKS", "You may have minor bruising."].join("\n"),
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
                        overallSummary: "One cross-document discrepancy identified.",
                        findings: [
                          {
                            category: "risks",
                            severity: "urgent",
                            concept: "Risk of bleeding",
                            direction: "consent_understates_protocol",
                            likelyOutOfSync: "consent",
                            protocol: {
                              fileName: "protocol.pdf",
                              sectionTitle: "Risks",
                              sectionId: "9",
                              page: 22,
                              quote: "Participants may experience minor or major bleeding.",
                            },
                            consent: {
                              fileName: "consent-form.pdf",
                              sectionTitle: "Possible Risks",
                              sectionId: "6",
                              quote: "You may have minor bruising.",
                            },
                            explanation:
                              "The protocol describes a broader bleeding risk than the consent form discloses.",
                            resolutionGuidance:
                              "Reconcile the risk language so both documents describe the same risk scope.",
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
      assert.equal(result.output.documentsAligned, false);
      assert.equal(result.output.findings[0].severity, "medium");
      assert.equal(result.output.findings[0].direction, "consent_understates_protocol");
      assert.equal(result.output.findings[0].likelyOutOfSync, "consent");
      assert.equal(result.output.findings[0].protocol.page, 22);
      assert.equal(result.output.findings[0].consent.page, null);
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

    it("normalizes consent consistency output defensively", async () => {
      const result = await executeConsentConsistencyReview(
        {
          workflow: { runId: "run-consent-1" },
          steps: {
            loadAssets: {
              model: "test-model",
              prompts: {
                consentContradictionReviewSystem: "system prompt",
                consentContradictionReviewUser:
                  "Input\n{{input_json}}\nOutput\n{{output_json_example}}",
              },
            },
            parseConsent: {
              source: "consentText",
              contentType: "text/plain",
              text: [
                "1 BEFORE YOUR VISIT",
                "Do not eat for 8 hours before your visit.",
                "8 PREPARING FOR YOUR APPOINTMENT",
                "You may eat normally before arriving.",
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
                        overallSummary: "Found one inconsistency.",
                        findings: [
                          {
                            category: "participant_instructions",
                            severity: "high",
                            concept: "Fasting requirement",
                            sectionA: {
                              sectionTitle: "Before Your Visit",
                              sectionId: "1",
                              quote: "Do not eat for 8 hours before your visit.",
                            },
                            sectionB: {
                              sectionTitle: "Preparing for Your Appointment",
                              sectionId: "8",
                              page: 6,
                              quote: "You may eat normally before arriving.",
                            },
                            explanation:
                              "The consent gives conflicting instructions about eating before the visit.",
                            resolutionGuidance:
                              "Reconcile the pre-visit eating instructions in Sections 1 and 8.",
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
      assert.equal(result.output.documentClean, false);
      assert.equal(result.output.findings.length, 1);
      assert.equal(result.output.findings[0].category, "participant_instructions");
      assert.equal(result.output.findings[0].sectionA.page, null);
      assert.equal(result.output.findings[0].sectionB.page, 6);
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

    it("surfaces consent consistency results separately", () => {
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
          executeContradictionReview: null,
          executeConsentConsistencyReview: {
            status: "completed",
            output: {
              overallSummary: "One consent inconsistency identified.",
              findings: [
                {
                  category: "participant_instructions",
                  severity: "high",
                  concept: "Fasting requirement",
                  sectionA: {
                    sectionTitle: "Before Your Visit",
                    sectionId: "1",
                    page: 3,
                    quote: "Do not eat for 8 hours before your visit.",
                  },
                  sectionB: {
                    sectionTitle: "Preparing for Your Appointment",
                    sectionId: "8",
                    page: 6,
                    quote: "You may eat normally before arriving.",
                  },
                  explanation:
                    "The consent gives conflicting instructions about eating before the visit.",
                  resolutionGuidance:
                    "Reconcile the pre-visit eating instructions in Sections 1 and 8.",
                },
              ],
            },
          },
        },
      });

      assert.equal(report.consentConsistencyReview.status, "completed");
      assert.equal(report.consentConsistencyReview.findings.length, 1);
      assert.match(report.audit_report_markdown, /INTERNAL CONSENT FORM CONSISTENCY REVIEW/);
    });

    it("surfaces cross-document comparison results separately", () => {
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
            contentType: "application/pdf",
            files: [],
          },
          parseConsent: {
            name: "Synthetic Consent",
            source: "consentDocument",
            contentType: "application/pdf",
          },
          executeSourceReviews: {
            results: [],
          },
          executeContradictionReview: null,
          executeConsentConsistencyReview: null,
          executeCrossDocComparison: {
            status: "completed",
            output: {
              overallSummary: "One cross-document discrepancy identified.",
              findings: [
                {
                  category: "risks",
                  severity: "high",
                  concept: "Risk of bleeding",
                  direction: "consent_understates_protocol",
                  likelyOutOfSync: "consent",
                  protocol: {
                    fileName: "protocol.pdf",
                    sectionTitle: "Risks",
                    sectionId: "9",
                    page: 22,
                    quote: "Participants may experience minor or major bleeding.",
                  },
                  consent: {
                    fileName: "consent-form.pdf",
                    sectionTitle: "Possible Risks",
                    sectionId: "6",
                    page: 4,
                    quote: "You may have minor bruising.",
                  },
                  explanation:
                    "The protocol describes a broader bleeding risk than the consent form discloses.",
                  resolutionGuidance:
                    "Reconcile the risk language so both documents describe the same risk scope.",
                },
              ],
            },
          },
        },
      });

      assert.equal(report.crossDocComparison.status, "completed");
      assert.equal(report.crossDocComparison.findings.length, 1);
      assert.match(report.audit_report_markdown, /PROTOCOL VS CONSENT CROSS-DOCUMENT REVIEW/);
      assert.match(report.audit_report_markdown, /Direction:/);
      assert.match(report.audit_report_markdown, /Likely Out of Sync:/);
    });

    it("surfaces all three review types in correct order when all complete", () => {
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
            contentType: "application/pdf",
            files: [],
          },
          parseConsent: {
            name: "Synthetic Consent",
            source: "consentDocument",
            contentType: "application/pdf",
          },
          executeSourceReviews: {
            results: [],
          },
          executeContradictionReview: {
            status: "completed",
            output: {
              overallSummary: "One protocol contradiction found.",
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
                  resolutionGuidance: "Reconcile the age eligibility language.",
                },
              ],
            },
          },
          executeConsentConsistencyReview: {
            status: "completed",
            output: {
              overallSummary: "One consent inconsistency found.",
              findings: [
                {
                  category: "participant_instructions",
                  severity: "high",
                  concept: "Fasting requirement",
                  sectionA: {
                    sectionTitle: "Before Your Visit",
                    sectionId: "1",
                    page: 3,
                    quote: "Do not eat for 8 hours.",
                  },
                  sectionB: {
                    sectionTitle: "Preparing",
                    sectionId: "8",
                    page: 6,
                    quote: "You may eat normally.",
                  },
                  explanation: "Conflicting fasting instructions.",
                  resolutionGuidance: "Reconcile the eating instructions.",
                },
              ],
            },
          },
          executeCrossDocComparison: {
            status: "completed",
            output: {
              overallSummary: "One cross-document discrepancy found.",
              findings: [
                {
                  category: "risks",
                  severity: "high",
                  concept: "Bleeding risk",
                  direction: "consent_understates_protocol",
                  likelyOutOfSync: "consent",
                  protocol: {
                    fileName: "protocol.pdf",
                    sectionTitle: "Risks",
                    sectionId: "9",
                    page: 22,
                    quote: "Minor or major bleeding.",
                  },
                  consent: {
                    fileName: "consent.pdf",
                    sectionTitle: "Possible Risks",
                    sectionId: "6",
                    page: 4,
                    quote: "Minor bruising.",
                  },
                  explanation: "Protocol describes broader bleeding risk.",
                  resolutionGuidance: "Reconcile the risk language.",
                },
              ],
            },
          },
        },
      });

      assert.equal(report.contradictionReview.status, "completed");
      assert.equal(report.consentConsistencyReview.status, "completed");
      assert.equal(report.crossDocComparison.status, "completed");

      const md = report.audit_report_markdown;
      assert.match(md, /INTERNAL CONTRADICTIONS REVIEW/);
      assert.match(md, /INTERNAL CONSENT FORM CONSISTENCY REVIEW/);
      assert.match(md, /PROTOCOL VS CONSENT CROSS-DOCUMENT REVIEW/);

      const contradictionPos = md.indexOf("INTERNAL CONTRADICTIONS REVIEW");
      const consentPos = md.indexOf("INTERNAL CONSENT FORM CONSISTENCY REVIEW");
      const crossDocPos = md.indexOf("PROTOCOL VS CONSENT CROSS-DOCUMENT REVIEW");
      assert.ok(contradictionPos < consentPos, "contradictions should appear before consent");
      assert.ok(consentPos < crossDocPos, "consent should appear before cross-doc");
    });

    it("handles missing cross-document comparison cleanly", () => {
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
          executeContradictionReview: null,
          executeConsentConsistencyReview: null,
          executeCrossDocComparison: null,
        },
      });

      assert.equal(report.crossDocComparison.status, "not_executed");
      assert.doesNotMatch(report.audit_report_markdown, /CROSS-DOCUMENT/);
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
              consentConsistencyReview: {
                status: "completed",
                overallSummary: "One consent inconsistency identified.",
                documentClean: false,
                findings: [
                  {
                    category: "participant_instructions",
                    severity: "high",
                    concept: "Fasting requirement",
                    sectionA: {
                      sectionTitle: "Before Your Visit",
                      sectionId: "1",
                      page: 3,
                      quote: "Do not eat for 8 hours before your visit.",
                    },
                    sectionB: {
                      sectionTitle: "Preparing for Your Appointment",
                      sectionId: "8",
                      page: 6,
                      quote: "You may eat normally before arriving.",
                    },
                    explanation:
                      "The consent gives conflicting instructions about eating before the visit.",
                    resolutionGuidance:
                      "Reconcile the pre-visit eating instructions in Sections 1 and 8.",
                  },
                ],
              },
              crossDocComparison: {
                status: "completed",
                overallSummary: "One cross-document discrepancy identified.",
                documentsAligned: false,
                findings: [
                  {
                    category: "risks",
                    severity: "high",
                    concept: "Risk of bleeding",
                    direction: "consent_understates_protocol",
                    likelyOutOfSync: "consent",
                    protocol: {
                      fileName: "protocol.pdf",
                      sectionTitle: "Risks",
                      sectionId: "9",
                      page: 22,
                      quote: "Participants may experience minor or major bleeding.",
                    },
                    consent: {
                      fileName: "consent-form.pdf",
                      sectionTitle: "Possible Risks",
                      sectionId: "6",
                      page: 4,
                      quote: "You may have minor bruising.",
                    },
                    explanation:
                      "The protocol describes a broader bleeding risk than the consent form discloses.",
                    resolutionGuidance:
                      "Reconcile the risk language so both documents describe the same risk scope.",
                  },
                ],
              },
              consentContext: {
                source: "consentDocument",
                name: "consent-form.pdf",
                contentType: "application/pdf",
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
      assert.match(finalPrompt, /"consent_consistency_review"/);
      assert.match(finalPrompt, /"cross_document_comparison"/);
      assert.match(finalPrompt, /"consent_context"/);
      assert.match(finalPrompt, /"Age range"/);
      assert.match(finalPrompt, /"Fasting requirement"/);
      assert.match(finalPrompt, /"Risk of bleeding"/);
    });
  });
});
