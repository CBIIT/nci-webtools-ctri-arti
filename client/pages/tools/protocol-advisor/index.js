import { createSignal, createMemo, Show, ErrorBoundary } from "solid-js";
import html from "solid-js/html";

import { AlertContainer } from "../../../components/alert.js";
import { FileUpload } from "../../../components/file-upload.js";
import { InfoCard } from "../../../components/info-card.js";
import { InlineSelect } from "../../../components/inline-select.js";
import { PageBanner } from "../../../components/page-banner.js";
import { alerts, clearAlert, handleError } from "../../../utils/alerts.js";

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

// TODO: Placeholder templates - they will come from API
const NIH_TEMPLATE_OPTIONS = [
  {
    value: "behavioral-social-science",
    label: "Behavioral & Social Science Research Protocol Template",
  },
  {
    value: "interventional-drug-device",
    label: "Interventional Drug and Device Clinical Trials Protocol Template",
  },
  {
    value: "natural-history-observational",
    label: "Natural History and Observational Trials Protocol Template",
  },
  {
    value: "nih-addendum-reviewing-irb",
    label: "NIH Protocol Addendum Template When NIH is the Reviewing IRB",
  },
  { value: "prospective-data-collection", label: "Prospective Data Collection Protocol Template" },
  { value: "psite-addendum", label: "pSite Protocol Addendum Template" },
  { value: "repository", label: "Repository Protocol Template" },
  {
    value: "retrospective-data-biospecimen",
    label: "Retrospective Data or Biospecimen Review Protocol Template",
  },
  { value: "secondary-research", label: "Secondary Research Protocol Template" },
];

export default function Page() {
  const [protocolFile, setProtocolFile] = createSignal(null);
  const [consentFiles, setConsentFiles] = createSignal([]);
  const [selectedTemplate, setSelectedTemplate] = createSignal("");
  const [showConfirmDialog, setShowConfirmDialog] = createSignal(false);

  const isTemplateEnabled = createMemo(() => !!protocolFile());
  const canSubmit = createMemo(() => !!protocolFile() && !!selectedTemplate());

  function removeProtocolFile() {
    setProtocolFile(null);
    setSelectedTemplate("");
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit()) {
      return;
    }

    setShowConfirmDialog(true);
  }

  function confirmAnalysis() {
    setShowConfirmDialog(false);
    // TODO: submit to backend
  }

  function cancelAnalysis() {
    setShowConfirmDialog(false);
  }

  return html`
    <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
    <${ErrorBoundary}
      fallback=${(error) => {
        handleError(error, "Protocol Advisor Error");
        return null;
      }}
    >
      <div class="bg-protocol-advisor font-smooth">
        <${PageBanner} title="Protocol Advisor" />

        <div class="container">
          <div class="pa-section-container">
            <form onSubmit=${handleSubmit}>
              <div class="pa-content">
                <!-- Intro Section -->
                <div class="row">
                  <div class="col-lg-9 d-flex flex-column gap-3">
                    <div class="d-flex flex-column gap-3">
                      <h2 class="pa-section-title mb-0">
                        Secure Protocol Document Upload & Analysis
                      </h2>
                      <p class="pa-section-description mb-0">
                        Upload your research protocol and informed consent documents for secure
                        processing and regulatory review.
                      </p>
                    </div>
                    <hr class="pa-divider w-100" />
                    <p class="pa-section-text mb-0">
                      Securely upload your research protocol and informed consent documents to
                      receive an AI-powered regulatory compliance review. Protocol Advisor
                      automatically checks for internal inconsistencies within your protocol,
                      alignment between your protocol and consent documents, and gaps in regulatory
                      compliance. You'll receive a detailed report with findings tied directly to
                      your documents, along with actionable recommendations to help you get ahead of
                      issues before formal review.
                    </p>
                  </div>
                </div>

                <!-- Form Fields -->
                <div class="row">
                  <div class="col-lg-5 d-flex flex-column gap-4">
                    <!-- Protocol Document Upload -->
                    <div class="d-flex flex-column gap-2">
                      <label class="pa-label">
                        Protocol Document<span class="pa-required">*</span>
                      </label>
                      <${FileUpload}
                        accept=${ALLOWED_EXTENSIONS}
                        maxSize=${MAX_FILE_SIZE}
                        file=${protocolFile}
                        onFileChange=${setProtocolFile}
                        onRemove=${removeProtocolFile}
                        buttonIcon=${html`<img
                          src="assets/images/protocol-advisor/icon-attachment.svg"
                          alt="Attach file"
                          width="16"
                          height="17"
                        />`}
                        placeholder="PDF or DOCX (max 25 MB)"
                      />
                    </div>

                    <!-- Protocol Template -->
                    <div class="d-flex flex-column gap-2">
                      <div class="d-flex flex-column gap-1">
                        <label class="pa-label">
                          Protocol Template<span class="pa-required">*</span>
                        </label>
                        <p class="pa-description-text mb-0">
                          Select the NIH-approved template that was used in your uploaded protocol
                          document.
                        </p>
                      </div>
                      <${InlineSelect}
                        options=${NIH_TEMPLATE_OPTIONS}
                        value=${selectedTemplate}
                        onChange=${setSelectedTemplate}
                        placeholder="Select a Template"
                        disabled=${() => !isTemplateEnabled()}
                      />
                    </div>

                    <!-- Consent Document Upload (Optional) -->
                    <div class="d-flex flex-column gap-2 mb-1">
                      <div class="d-flex flex-column gap-1">
                        <label class="pa-label">Consent Documents</label>
                        <p class="pa-description-text mb-0">
                          Upload your informed consent documents to evaluate its internal
                          consistency and alignment with your protocol.
                        </p>
                      </div>
                      <${FileUpload}
                        multiple=${true}
                        accept=${ALLOWED_EXTENSIONS}
                        maxSize=${MAX_FILE_SIZE}
                        files=${consentFiles}
                        onFilesChange=${setConsentFiles}
                        buttonIcon=${html`<img
                          src="assets/images/protocol-advisor/icon-attachment.svg"
                          alt="Attach file"
                          width="16"
                          height="17"
                        />`}
                        placeholder="PDF or DOCX (max 25 MB)"
                      />
                    </div>

                    <!-- Information Panel -->
                    <${InfoCard}
                      class="mt-3"
                      items=${[
                        {
                          icon: "assets/images/protocol-advisor/icon-clock.svg",
                          iconAlt: "Clock",
                          title: "Estimated Processing Time: ",
                          description: html`<span class="pa-info-description">
                            15-30 minutes
                            <br />
                            The analysis involves comprehensive checks across multiple regulatory
                            frameworks and may take some time to complete.
                          </span>`,
                        },
                        {
                          icon: "assets/images/protocol-advisor/icon-mail.svg",
                          iconAlt: "Email",
                          title: "Report Delivery",
                          description: html`<span class="pa-info-description">
                            You will receive a detailed compliance report at your registered email
                            address once the analysis is complete.
                          </span>`,
                        },
                        {
                          icon: "assets/images/protocol-advisor/icon-analysis.svg",
                          iconAlt: "Document analysis",
                          title: "Analysis Includes",
                          description: html`<ul class="pa-info-list mt-1">
                            <li>
                              <img
                                src="assets/images/protocol-advisor/icon-checkmark.svg"
                                alt="Checkmark"
                                width="15"
                                height="11"
                              />
                              Template Completeness Verification
                            </li>
                            <li>
                              <img
                                src="assets/images/protocol-advisor/icon-checkmark.svg"
                                alt="Checkmark"
                                width="15"
                                height="11"
                              />
                              Regulatory Compliance Engine
                            </li>
                            <li>
                              <img
                                src="assets/images/protocol-advisor/icon-checkmark.svg"
                                alt="Checkmark"
                                width="15"
                                height="11"
                              />
                              Intra-Document Consistency Validation
                            </li>
                            <li>
                              <img
                                src="assets/images/protocol-advisor/icon-checkmark.svg"
                                alt="Checkmark"
                                width="15"
                                height="11"
                              />
                              Cross-Document Validation for Protocol Documents and Consent Forms
                            </li>
                          </ul>`,
                        },
                      ]}
                    />

                    <!-- Start Analysis -->
                    <div class="d-flex justify-content-center py-3">
                      <div
                        class="pa-submit-wrapper"
                        title=${() =>
                          canSubmit() ? "" : "Upload a valid protocol to enable analysis"}
                      >
                        <button type="submit" class="pa-submit-btn" disabled=${() => !canSubmit()}>
                          Start Analysis
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>

      <!-- Confirmation Dialog -->
      <${Show} when=${showConfirmDialog}>
        <div class="pa-dialog-overlay" onClick=${cancelAnalysis}>
          <div class="pa-dialog" onClick=${(e) => e.stopPropagation()}>
            <h3 class="pa-dialog-title">Confirm Analysis</h3>
            <p class="pa-dialog-text">
              You are about to submit your protocol for analysis. This process takes approximately
              15-30 minutes. You will receive the compliance report at your registered email
              address.
            </p>
            <p class="pa-dialog-text"><strong>Protocol:</strong> ${() => protocolFile()?.name}</p>
            <${Show} when=${() => consentFiles().length > 0}>
              <p class="pa-dialog-text">
                <strong>Consent Documents:</strong> ${() =>
                  consentFiles()
                    .map((f) => f.name)
                    .join(", ")}
              </p>
            <//>
            <p class="pa-dialog-text"><strong>Template:</strong> ${selectedTemplate}</p>
            <div class="d-flex justify-content-end gap-3 mt-4">
              <button type="button" class="pa-dialog-cancel-btn" onClick=${cancelAnalysis}>
                Cancel
              </button>
              <button type="button" class="pa-submit-btn" onClick=${confirmAnalysis}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      <//>
    <//>
  `;
}
