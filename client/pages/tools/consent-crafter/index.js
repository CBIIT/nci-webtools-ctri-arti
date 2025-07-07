import html from "solid-js/html";
import { Show, For, createSignal, createResource } from "solid-js";
import { parseDocument } from "/utils/parsers.js";
import { readFile } from "/utils/files.js";
import { createReport } from "docx-templates";
import yaml from "yaml";

export default function Page() {
  const [inputText, setInputText] = createSignal("");
  const [outputText, setOutputText] = createSignal("");
  const [model, setModel] = createSignal("us.anthropic.claude-sonnet-4-20250514-v1:0");
  const [customSystemPrompt, setCustomSystemPrompt] = createSignal(defaultSystemPrompt);
  const [customTemplate, setCustomTemplate] = createSignal();
  const [promptTemplates, setPromptTemplates] = createSignal(defaultPromptTemplates);
  const [selectedTemplates, setSelectedTemplates] = createSignal([]);
  const [generatedDocuments, setGeneratedDocuments] = createSignal({});
  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));

  // Create template groups from available prompt templates
  const templateGroups = () => {
    const templates = promptTemplates();
    const groups = {};

    Object.entries(templates).forEach(([id, template]) => {
      const category = template.category || "Other";
      if (!groups[category]) {
        groups[category] = { label: category, options: [] };
      }
      groups[category].options.push({
        value: id,
        disabled: template.disabled === true,
      });
    });

    return Object.values(groups);
  };

  async function handleFileSelect(event) {
    const input = event.target;
    const name = input.name;
    const file = input.files?.[0];
    if (!file) return;
    const bytes = await readFile(file, "arrayBuffer");

    if (name === "outputTemplateFile") {
      setCustomTemplate(bytes);
    } else if (name === "inputTextFile") {
      setInputText("Reading file...");
      setOutputText("");
      setGeneratedDocuments({});
      const text = await parseDocument(bytes, file.type, file.name);
      setInputText(text);
      setOutputText("");
    }
  }

  async function processSelectedTemplates(text) {
    const selected = selectedTemplates();
    const templates = promptTemplates();

    // Build list of templates to process (selected + custom if available)
    const templatesToProcess = [...selected];
    const hasCustom = customTemplate() && customSystemPrompt().trim();
    if (hasCustom) {
      templatesToProcess.push("custom");
    }

    if (templatesToProcess.length === 0) return;

    // Initialize processing status for each template
    const initialStatus = {};
    templatesToProcess.forEach((templateId) => {
      initialStatus[templateId] = { status: "processing", blob: null, error: null };
    });
    setGeneratedDocuments(initialStatus);

    // Process all templates in parallel
    const promises = templatesToProcess.map(async (templateId) => {
      try {
        let template, templateFile, systemPrompt, defaultOutputData;

        if (templateId === "custom") {
          // Handle custom template
          systemPrompt = customSystemPrompt();
          defaultOutputData = defaultOutput; // Use default output structure for custom
          templateFile = customTemplate();
        } else {
          // Handle predefined templates
          template = templates[templateId];
          systemPrompt = template.systemPrompt;
          defaultOutputData = template.defaultOutput;
          templateFile = await fetch(template.templateUrl).then((res) => res.arrayBuffer());
        }

        // Extract data using AI
        const params = {
          model: model(),
          messages: [{ role: "user", content: [{ text: "Please process the document in the system prompt." }] }],
          system: systemPrompt.replace("{{document}}", text),
          stream: false,
        };
        const output = await runModel(params);
        const jsonOutput = output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || "{}";
        const data = { ...defaultOutputData, ...yaml.parse(jsonOutput) };

        // Generate document
        const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        const cmdDelimiter = ["{{", "}}"];
        const buffer = await createReport({ template: templateFile, data, cmdDelimiter });
        const blob = new Blob([buffer], { type });

        // Update status to completed
        setGeneratedDocuments((prev) => ({
          ...prev,
          [templateId]: { status: "completed", blob, error: null },
        }));
      } catch (error) {
        console.error(`Error processing ${templateId}:`, error);
        setGeneratedDocuments((prev) => ({
          ...prev,
          [templateId]: { status: "error", blob: null, error: error.message },
        }));
      }
    });

    await Promise.all(promises);
  }

  function downloadDocument(templateId) {
    const doc = generatedDocuments()[templateId];
    if (!doc?.blob) return;

    let filename;
    if (templateId === "custom") {
      filename = "custom-document.docx";
    } else {
      const templates = promptTemplates();
      const template = templates[templateId];
      filename = template.filename;
    }

    const url = URL.createObjectURL(doc.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadAll() {
    const docs = generatedDocuments();
    Object.keys(docs).forEach((templateId) => {
      if (docs[templateId].status === "completed") {
        downloadDocument(templateId);
      }
    });
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const text = inputText();
    if (!text || selectedTemplates().length === 0) return;
    await processSelectedTemplates(text);
  }

  async function handleReset(event) {
    event?.preventDefault();

    // Reset form inputs
    if (event?.target) {
      event.target.inputTextFile.value = "";
      event.target.outputTemplateFile.value = "";
    }

    // Clear all state
    setInputText("");
    setOutputText("");
    setCustomTemplate(null);
    setCustomSystemPrompt(defaultSystemPrompt);
    setPromptTemplates(defaultPromptTemplates);
    setSelectedTemplates([]);
    setGeneratedDocuments({});
  }

  /**
   * Runs an AI model with the given parameters and returns the output text.
   * @param {any} params
   * @returns {Promise<string>} The output text from the model
   */
  async function runModel(params) {
    const response = await fetch("/api/model", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    return data?.output?.message?.content?.[0]?.text || "";
  }

  return html`
    <div class="container py-3">
      <h1 class="fw-bold text-gradient my-3">Consent Crafter</h1>
      <form onSubmit=${handleSubmit} onReset=${handleReset}>
        <div class="row align-items-stretch">
          <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
            <label for="inputText" class="form-label">Source Document</label>
            <input
              type="file"
              id="inputTextFile"
              name="inputTextFile"
              class="form-control form-control-sm  mb-3"
              accept=".txt, .docx, .pdf"
              onChange=${handleFileSelect} />

            <!-- Template Selection -->
            <div class="mb-3">
              <label class="form-label">Generate Forms</label>
              <div class="border rounded p-2">
                <${For} each=${templateGroups}>
                  ${(group) => html`
                    <div class="mb-2">
                      <div class="fw-bold text-muted small">${() => group.label}</div>
                      <${For} each=${() => group.options}>
                        ${(option) => html`
                          <div class="form-check form-control-sm min-height-auto py-0 ms-1">
                            <input
                              class="form-check-input cursor-pointer "
                              type="checkbox"
                              id=${() => option.value}
                              disabled=${() => option.disabled}
                              checked=${() => selectedTemplates().includes(option.value)}
                              onChange=${(e) => {
                                const value = option.value;
                                const isChecked = e.target.checked;
                                setSelectedTemplates((prev) => (isChecked ? [...prev, value] : prev.filter((v) => v !== value)));
                              }} />
                            <label
                              class=${() =>
                                ["form-check-label cursor-pointer ", option.disabled ? "text-muted" : ""].filter(Boolean).join(" ")}
                              for=${() => option.value}>
                              ${() => promptTemplates()[option.value].label}
                            </label>
                          </div>
                        `}
                      <//>
                    </div>
                  `}
                <//>
              </div>
            </div>

            <!-- Submit Button -->
            <div class="d-flex flex-wrap justify-content-between align-items-center">
              <${Show} when=${() => [1, 2].includes(session()?.user?.Role?.id)}>
                <details class="small text-secondary mt-2">
                  <summary>Advanced Options</summary>

                  <label for="model" class="form-label">Model</label>
                  <select
                    class="form-select form-select-sm cursor-pointer mb-2"
                    name="model"
                    id="model"
                    value=${model}
                    onChange=${(e) => setModel(e.target.value)}>
                    <option value="us.anthropic.claude-opus-4-20250514-v1:0">Opus</option>
                    <option value="us.anthropic.claude-sonnet-4-20250514-v1:0">Sonnet</option>
                    <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku</option>
                    <option value="us.meta.llama4-maverick-17b-instruct-v1:0">Maverick</option>
                  </select>

                  <div class="d-flex justify-content-between align-items-center">
                    <label for="outputTemplate" class="form-label">Output Template (.docx)</label>
                    <a
                      href="/templates/nih-cc-consent-template-2024-04-15.docx"
                      download="nih-cc-consent-template-2024-04-15.docx"
                      class="small"
                      >Download Template</a
                    >
                  </div>
                  <input
                    type="file"
                    id="outputTemplateFile"
                    name="outputTemplateFile"
                    class="form-control form-control-sm mb-2"
                    accept=".txt, .docx, .pdf"
                    onChange=${handleFileSelect} />

                  <label for="systemPrompt" class="form-label">Custom System Prompt</label>
                  <textarea
                    class="form-control form-control-sm rounded-top-0 flex-grow-1"
                    id="systemPrompt"
                    name="systemPrompt"
                    rows="20"
                    placeholder="Enter custom system prompt"
                    value=${customSystemPrompt}
                    onChange=${(e) => setCustomSystemPrompt(e.target.value)} />
                  <div class="form-text">
                    Use <strong>{{document}}</strong> as a placeholder for the source document. Will create a custom document if both prompt
                    and template are provided.
                  </div>
                </details>
              <//>

              <div class="d-flex mt-1 gap-1">
                <button type="reset" class="btn btn-sm btn-outline-danger">Reset</button>
                <button type="submit" class="btn btn-sm btn-primary" disabled=${() => !inputText() || selectedTemplates().length === 0}>
                  Generate
                </button>
              </div>
            </div>
          </div>
          <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
            <div class="d-flex justify-content-between align-items-center">
              <label class="form-label">Generated Forms</label>
              <${Show}
                when=${() => {
                  const docs = generatedDocuments();
                  return Object.values(docs).some((doc) => doc.status === "completed");
                }}>
                <button type="button" class="btn btn-sm btn-link" onClick=${downloadAll}>Download All</button>
              <//>
            </div>
            <div class="border rounded p-3 flex-grow-1" style="min-height: 200px;">
              <${Show}
                when=${() => Object.keys(generatedDocuments()).length > 0}
                fallback=${html`<div class="text-muted text-center mt-5">
                  Upload a source document on the left, select consent forms, and click "Generate"
                </div>`}>
                <div class="d-flex flex-column gap-2">
                  <${For} each=${() => Object.keys(generatedDocuments())}>
                    ${(templateId) => {
                      const doc = () => generatedDocuments()[templateId];
                      const documentInfo = () => {
                        if (templateId === "custom") {
                          return { label: "Custom Document", filename: "custom-document.docx" };
                        } else {
                          const templates = promptTemplates();
                          const template = templates[templateId];
                          return { label: template.label, filename: template.filename };
                        }
                      };

                      return html`
                        <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                          <div class="flex-grow-1">
                            <div class="fw-medium">${() => documentInfo().label}</div>
                            <small class="text-muted">${() => documentInfo().filename}</small>
                          </div>
                          <div>
                            <${Show} when=${() => doc()?.status === "processing"}>
                              <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
                                <span class="visually-hidden">Processing...</span>
                              </div>
                            <//>
                            <${Show} when=${() => doc()?.status === "completed"}>
                              <button type="button" class="btn btn-sm btn-success me-2" onClick=${() => downloadDocument(templateId)}>
                                Download
                              </button>
                            <//>
                            <${Show} when=${() => doc()?.status === "error"}>
                              <div class="text-danger small">Error: ${() => doc().error}</div>
                            <//>
                          </div>
                        </div>
                      `;
                    }}
                  <//>
                </div>
              <//>
            </div>
          </div>
        </div>
      </form>
    </div>
  `;
}

export const defaultOutput = {
  PI: "",
  Title: "",
  Cohort: "",
  Contact_Name: "",
  Contact_Email: "",
  Contact_Phone: "",
  Key_Info_1: "",
  Key_Info_2: "",
  Voluntariness: "",
  Parent_Permission: "",
  Impaired_Adults: "",
  Study_Purpose: "",
  Investigational_Use: "",
  Approved_Use: "",
  Before_You_Begin: "",
  During_The_Study: "",
  Follow_Up: "",
  How_Long: "",
  How_Many: "",
  Risks_Discomforts: "",
  Risks_Procedures: "",
  Risks_Pregnancy: "",
  Risks_Radiation: "",
  Potential_Benefits_You: "",
  Potential_Benefits_Others: "",
  Other_Options: "",
  Return_Results: "",
  Early_Withdrawal: "",
  Disease_Condition: "",
  Genomic_Sensitivity: "",
  Anonymized_Specimen_Sharing: "",
  Data_Save_Type: "",
  Specimen_Storage: "",
  No_Payment: "",
  Yes_Payment: "",
  Partial_Payment: "",
  Payment_Large: "",
  Reimbursement: "",
  Costs: "",
  COI_None: "",
  Technology_License: "",
  CRADA: "",
  CTA_No_NonNIH: "",
  CTA_Yes_NonNIH: "",
  Confidentiality: "",
  Confidentiality_Study_Sponsor: "",
  Confidentiality_Manufacturer: "",
  Confidentiality_Drug_Device: "",
  Other_Contacts: "",
  Other_Contact_Name: "",
  Other_Contact_Email: "",
  Other_Contact_Phone: "",
};

export const defaultSystemPrompt = `# NIH Consent Form Variable Extractor

Extract variables from the clinical protocol to populate an NIH consent form template.

## INPUT
The clinical trial protocol is provided below:
\`\`\`
<protocol>{{document}}</protocol>
\`\`\`

## OUTPUT
Return a valid JSON object with ALL variables below. Use empty strings ("") for any variables not found in the protocol.

\`\`\`json
{
  "PI": "",
  "Title": "",
  "Cohort": "", 
  "Contact_Name": "",
  "Contact_Email": "",
  "Contact_Phone": "",
  "Key_Info_1": "",
  "Key_Info_2": "",
  "Voluntariness": "",
  "Parent_Permission": "",
  "Impaired_Adults": "",
  "Study_Purpose": "",
  "Investigational_Use": "",
  "Approved_Use": "",
  "Before_You_Begin": "",
  "During_The_Study": "",
  "Follow_Up": "",
  "How_Long": "",
  "How_Many": "",
  "Risks_Discomforts": "",
  "Risks_Procedures": "",
  "Risks_Pregnancy": "",
  "Risks_Radiation": "",
  "Potential_Benefits_You": "",
  "Potential_Benefits_Others": "",
  "Other_Options": "",
  "Return_Results": "",
  "Early_Withdrawal": "",
  "Disease_Condition": "",
  "Genomic_Sensitivity": "",
  "Anonymized_Specimen_Sharing": "",
  "Data_Save_Type": "",
  "Specimen_Storage": "",
  "No_Payment": "",
  "Yes_Payment": "",
  "Partial_Payment": "",
  "Payment_Large": "",
  "Reimbursement": "",
  "Costs": "",
  "COI_None": "",
  "Technology_License": "",
  "CRADA": "",
  "CTA_No_NonNIH": "",
  "CTA_Yes_NonNIH": "",
  "Confidentiality": "",
  "Confidentiality_Study_Sponsor": "",
  "Confidentiality_Manufacturer": "",
  "Confidentiality_Drug_Device": "",
  "Other_Contacts": "",
  "Other_Contact_Name": "",
  "Other_Contact_Email": "",
  "Other_Contact_Phone": ""
}
\`\`\`

## EXTRACTION RULES
- Fill in values ONLY from information explicitly stated in the protocol
- Use empty string ("") for any variable not found in the document
- Keep language clear and appropriate for consent forms
- Use direct address ("you will") when describing procedures
- Do not guess or infer information not explicitly stated

## VARIABLE DESCRIPTIONS
- **PI**: Principal Investigator name
- **Title**: Study title
- **Cohort**: Study population/cohort description
- **Contact_Name/Email/Phone**: Primary contact information
- **Key_Info_1/2**: Most important information participants should know
- **Study_Purpose**: Why this study is being conducted
- **Before_You_Begin**: What happens before study participation starts
- **During_The_Study**: Main study procedures and activities
- **Follow_Up**: Follow-up procedures and timeline
- **How_Long**: Total duration of study participation
- **How_Many**: Number of participants in the study
- **Risks_Discomforts**: Main risks and discomforts of participation
- **Potential_Benefits_You**: Benefits to the participant
- **Potential_Benefits_Others**: Benefits to others/society
- **Other_Options**: Alternatives to study participation

Return the complete JSON object with all variables, using empty strings for missing values.`;

// NIH Consent Crafter Default Templates
export const defaultPromptTemplates = {
  "adult-healthy": {
    label: "Adult healthy volunteer",
    category: "Consent",
    templateUrl: "/templates/nih-cc-consent-template-2024-04-15.docx",
    systemPrompt: defaultSystemPrompt,
    defaultOutput: defaultOutput,
    filename: "nih-consent-healthy-volunteer.docx",
    disabled: false,
  },
  "adult-patient": {
    label: "Adult affected patient",
    category: "Consent",
    templateUrl: "/templates/nih-cc-consent-template-2024-04-15.docx",
    systemPrompt: defaultSystemPrompt,
    defaultOutput: defaultOutput,
    filename: "nih-consent-patient.docx",
    disabled: false,
  },
  "adult-family": {
    label: "Adult family member",
    category: "Consent",
    templateUrl: "/templates/nih-cc-consent-template-2024-04-15.docx",
    systemPrompt: defaultSystemPrompt,
    defaultOutput: defaultOutput,
    filename: "nih-consent-family.docx",
    disabled: false,
  },
  "child-assent": {
    label: "Child or cognitive impairment patient",
    category: "Assent",
    templateUrl: "/templates/nih-cc-assent-template-2024-04-15.docx",
    systemPrompt: defaultSystemPrompt, // Would be different assent prompt in future
    defaultOutput: defaultOutput,
    filename: "nih-assent-child.docx",
    disabled: true,
  },
  "child-family-assent": {
    label: "Child or cognitive impairment family member",
    category: "Assent",
    templateUrl: "/templates/nih-cc-assent-template-2024-04-15.docx",
    systemPrompt: defaultSystemPrompt, // Would be different assent prompt in future
    defaultOutput: defaultOutput,
    filename: "nih-assent-family.docx",
    disabled: true,
  },
};
