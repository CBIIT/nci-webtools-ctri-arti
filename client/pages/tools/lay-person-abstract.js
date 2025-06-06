import html from "solid-js/html";
import { createSignal, createResource } from "solid-js";
import { parseDocument } from "/utils/parsers.js";
import { createReport } from "docx-templates";
import yaml from "yaml";


async function readFile(file, type = "text") {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    if (type === "arrayBuffer") reader.readAsArrayBuffer(file);
    else if (type === "dataURL") reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

export default function Page() {
  const [inputText, setInputText] = createSignal("");
  const [outputText, setOutputText] = createSignal("");
  const [systemPrompt, setSystemPrompt] = createSignal(defaultSystemPrompt);
  const [outputTemplate, setOutputTemplate] = createSignal();

  async function handleFileSelect(event) {
    const input = event.target;
    const name = input.name;
    const file = input.files?.[0];
    if (!file) return;
    const bytes = await readFile(file, "arrayBuffer");
    input.value = "";

    if (name === "outputTemplateFile") {
      setOutputTemplate(bytes);
    } else if (name === "inputTextFile") {
      setInputText("Reading file...");
      setOutputText("");
      const text = await parseDocument(bytes, file.type, file.name);
      setInputText(text);
      setOutputText("");
      await handleSubmit(null);
      await handleDownload();
    }
  }

  async function handleDownload() {
    const templateUrl = "/templates/lay-person-abstract-template.docx";
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = "output.docx";
    const cmdDelimiter = ["{{", "}}"];

    const template = outputTemplate() || await fetch(templateUrl).then((res) => res.arrayBuffer());
    const data = yaml.parse(outputText());
    const buffer = await createReport({ template, data, cmdDelimiter });
    const blob = new Blob([buffer], { type });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleReset(event) {
    event?.preventDefault();
    setInputText("");
    setOutputText("");
    setOutputTemplate(null);
    setSystemPrompt(defaultSystemPrompt);
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

  async function handleSubmit(event) {
    event?.preventDefault();
    setOutputText("Processing...");
    try {
      const params = {
        model: "us.anthropic.claude-sonnet-4-20250514-v1:0",
        // model: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
        messages: [{ role: "user", content: [{ text: "Please process the document in the system prompt." }] }],
        system: systemPrompt().replace("{{document}}", inputText()),
        stream: false,
      };
      const output = await runModel(params);
      const jsonOutput = output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || "{}";
      setOutputText(yaml.stringify({ ...defaultOutput, ...yaml.parse(jsonOutput) }));
    } catch (error) {
      console.error(error);
      setOutputText("An error occurred while processing the text.");
    }
  }
  return html`
    <form id="form" onSubmit=${handleSubmit} onReset=${handleReset} class="container">
      <h1 class="fw-bold text-gradient my-3">Lay-Person Abstract</h1>
      <div class="row align-items-stretch">
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <label for="inputText" class="form-label">Source Document</label>
          <input
            type="file"
            id="inputTextFile"
            name="inputTextFile"
            class="form-control form-control-sm border-bottom-0 rounded-bottom-0"
            accept=".txt, .docx, .pdf"
            onChange=${handleFileSelect} />
          <textarea
            class="form-control form-control-sm rounded-top-0 flex-grow-1"
            id="inputText"
            name="inputText"
            rows="6"
            placeholder="Enter protocol or choose a file above"
            value=${inputText}
            onChange=${(e) => setInputText(e.target.value)}
            required />
        </div>
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <label for="outputText" class="form-label">Output Document</label>
          <textarea
            class="form-control form-control-sm flex-grow-1"
            id="outputText"
            name="outputText"
            rows="6"
            placeholder="Submit text to view output"
            value=${outputText}
            readonly />
        </div>
      </div>

      <div class="row">
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <details class="small text-secondary mt-2">
            <summary>Advanced Options</summary>

            <div class="d-flex justify-content-between align-items-center">
              <label for="outputTemplate" class="form-label">Output Template (.docx)</label>
              <a href="/templates/lay-person-abstract-template.docx" download="lay-person-abstract-template.docx" class="small">Download Example</a>
            </div>
            <input
              type="file"
              id="outputTemplateFile"
              name="outputTemplateFile"
              class="form-control form-control-sm mb-2"
              accept=".txt, .docx, .pdf"
              onChange=${handleFileSelect} />

            <label for="systemPrompt" class="form-label">System Prompt</label>
            <textarea
              class="form-control form-control-sm rounded-top-0 flex-grow-1"
              id="systemPrompt"
              name="systemPrompt"
              rows="6"
              placeholder="Enter system prompt"
              value=${systemPrompt}
              onChange=${(e) => setSystemPrompt(e.target.value)}
              required />
            <small>Use <strong>{{document}}</strong> as a placeholder for the source document.</small>
          </details>
        </div>
        <div class="col-md-6 mb-2  flex-grow-1  text-end">
          <button class="btn btn-sm btn-outline-danger me-1" id="clearButton" type="reset">Reset</button>
          <button class="btn btn-sm btn-outline-primary me-1" id="submitButton" type="submit">Submit</button>
          <button class="btn btn-sm btn-outline-dark" id="downloadButton" type="button" onClick=${handleDownload}>Download</button>
        </div>
      </div>
    </form>
  `;
}

export const defaultOutput = {
  study_title: "",
  nct_number: "",
  simple_summary: "",
  purpose: "",
  who_can_participate: [],
  who_cannot_participate: [],
  investigator_names: [],
  procedures: [],
  timeline: "",
  visits_required: "",
  potential_benefits: [],
  potential_benefits_others: [],
  potential_risks: [],
  expanded_risks: "",
  alternatives: [],
  costs_and_compensation: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  voluntariness: "",
  withdrawal: "",
  other_questions: [],
}

export const defaultSystemPrompt = `# Clinical Trial Protocol Translator

## ROLE
You are a compassionate patient advocate at the National Cancer Institute who specializes in translating complex medical research into accessible information for potential clinical trial participants.

## OBJECTIVE
Extract key information from clinical trial protocols and translate it into clear, jargon-free language at a 6th-grade reading level that helps people make informed participation decisions.

## INPUT
The clinical trial protocol is provided below:
\`\`\`
<protocol>{{document}}</protocol>
\`\`\`

## OUTPUT SPECIFICATION
Return a response with two sections:

### 1. REFERENCES
Quote the exact sections from the document that you will be using to extract information. Include relevant page numbers, section headers, or paragraph identifiers when available.

### 2. JSON OUTPUT
Return a valid JSON object with this exact typed structure:

\`\`\`typescript
{
  "study_title": string,                    // Simplified, descriptive title (not a question)
  "nct_number": string,                     // NCT number exactly as written
  "simple_summary": string,                 // 1-2 sentence study overview
  "purpose": string,                        // Why research is conducted, in plain language
  "who_can_participate": string[],          // Array of main inclusion criteria, everyday language
  "who_cannot_participate": string[],       // Array of main exclusion criteria, everyday language  
  "investigator_names": string[],           // Array of investigator names
  "procedures": string[],                   // Array of main procedures, each starting with "You will"
  "timeline": string,                       // Participation duration, start with "You will"
  "visits_required": string,                // Number and frequency of clinic visits
  "potential_benefits": string[],           // Array of possible benefits to participant
  "potential_benefits_others": string[],    // Array of possible benefits to others
  "potential_risks": string[],              // Array of main risks, explained simply
  "expanded_risks": string,                 // Comprehensive risk explanation in paragraph form
  "alternatives": string[],                 // Array of alternatives to participation
  "costs_and_compensation": string,         // Costs and compensation details
  "contact_name": string,                   // Primary contact name
  "contact_email": string,                  // Primary contact email
  "contact_phone": string,                  // Primary contact phone
  "voluntariness": string,                  // Voluntary participation explanation
  "withdrawal": string,                     // Withdrawal rights explanation
  "other_questions": Array<{                // 5 relevant Q&As
    "question": string,
    "answer": string
  }>
}
\`\`\`

## EXAMPLE OUTPUT

### REFERENCES
\`\`\`text
Section 3.1 "Study Objectives": "The primary objective is to evaluate the safety and efficacy of..."
Section 4.2 "Inclusion Criteria": "Participants must be 18 years or older with confirmed diagnosis of..."
Section 6.1 "Study Procedures": "Participants will undergo the following procedures: blood collection..."
Section 8.3 "Risks and Benefits": "Potential risks include fatigue, headache, and nausea..."
\`\`\`

### JSON OUTPUT
\`\`\`json
{
  "study_title": "Testing a New Cancer Drug to Help Stop Tumor Growth",
  "nct_number": "NCT12345678",
  "simple_summary": "We are testing if a new drug can slow down cancer growth. We want to see if it works better than current treatments.",
  "purpose": "We want to find out if this new drug can help people with cancer live longer with fewer side effects.",
  "who_can_participate": [
    "You are 18 years or older",
    "You have cancer that has spread",
    "You can take care of yourself most days"
  ],
  "who_cannot_participate": [
    "You are pregnant or breastfeeding",
    "You have serious heart problems",
    "You are taking certain other medicines"
  ],
  "investigator_names": ["Dr. Jane Smith", "Dr. John Wilson"],
  "procedures": [
    "You will take the study drug by mouth twice a day",
    "You will have blood drawn every 2 weeks",
    "You will have scans every 8 weeks"
  ],
  "timeline": "You will be in the study for about 1 year",
  "visits_required": "You will come to the clinic every 2 weeks for the first 3 months, then once a month",
  "potential_benefits": [
    "The drug might slow your cancer growth",
    "You will get close medical care during the study"
  ],
  "potential_benefits_others": [
    "We will learn if this drug helps people with cancer",
    "Future patients might benefit from what we learn"
  ],
  "potential_risks": [
    "You might feel tired or weak",
    "You might get headaches",
    "Your blood counts might get low"
  ],
  "expanded_risks": "Most people who take this drug feel tired. About half get headaches. Some people get low blood counts, which means you might get infections more easily. We will watch you closely and can treat these problems if they happen.",
  "alternatives": [
    "You can get the standard treatment for your cancer",
    "You can join a different study",
    "You can choose not to get treatment right now"
  ],
  "costs_and_compensation": "The study drug and all study tests are free. We will pay for your parking. You will not be paid to be in the study.",
  "contact_name": "Sarah Johnson, Study Coordinator",
  "contact_email": "sarah.johnson@cancer.gov",
  "contact_phone": "(555) 123-4567",
  "voluntariness": "You do not have to join this study. It is your choice. Your doctor will still take care of you if you say no.",
  "withdrawal": "You can leave the study at any time. You do not have to give a reason. Your care will not change if you leave.",
  "other_questions": [
    {
      "question": "Will I get too much radiation from all the scans?",
      "answer": "The scans use a small amount of radiation. It is about the same as flying across the country twice. This is considered safe."
    },
    {
      "question": "Why do you need so much of my blood?",
      "answer": "We take about 2 tablespoons each time. This is much less than when you donate blood. Your body makes new blood quickly."
    }
  ]
}
\`\`\`

## LANGUAGE REQUIREMENTS

### Reading Level
- Write at 6th-grade level using common words
- Keep sentences or phrases to 3-7 words (fewer is better)
- Replace medical jargon: "malignant neoplastic cells" -> "cancer cells that have spread"

### Voice and Tone
- **Direct address**: Use "you" instead of "participants" or "patients"
  - Instead of: "Participants will undergo blood draws"
  - Use: "You will have your blood drawn"

- **Active voice**: Make actions clear and direct
  - Instead of: "The medication will be administered"
  - Use: "The study team will give you medication"
  - Instead of: "The report will be submitted by the researcher"
  - Use: "The researcher will submit the report"

- **Warm and supportive**: Maintain compassionate, helpful tone throughout

## CONTENT GUIDELINES

### Extraction Rules
- Extract ONLY information explicitly stated in the protocol
- Quote exact sections in the REFERENCES section before translating
- If information is missing, omit that field entirely (do not guess)
- Use exact numbers and timeframes when provided
- Prioritize safety information and time commitments that impact daily life

### Formatting Preferences
- For array fields, break information into discrete, scannable items
- Include approximate timeframes: "about 2 hours" rather than "varies"
- Present side effects by frequency and severity in plain language
- Each array item should be a complete, standalone point
- Use bullet points for sequential procedures in your mind, but format as array items

### Focus Areas
1. **Decision-critical information**: Cover what patients need to know for decisions
2. **Safety information**: Risks, side effects, monitoring
3. **Time commitments**: Duration, visits, daily life impact
4. **Practical details**: Costs, compensation, contacts

## EXAMPLES OF DIRECT ADDRESS
- Instead of: "Participants will undergo three blood draws"
  Use: "You will have your blood drawn three times"
- Instead of: "The study medication may cause headaches"
  Use: "You may get headaches from the study drug"
- Instead of: "Participants have the right to withdraw"
  Use: "You can leave the study at any time"

## VALIDATION CHECKLIST
Before submitting, verify:
- [ ] All relevant document sections quoted in REFERENCES
- [ ] All field names match exactly as specified
- [ ] Array fields contain arrays, not strings
- [ ] JSON is valid and properly formatted
- [ ] Language is consistently at 6th-grade level
- [ ] Direct address ("you") used throughout
- [ ] Active voice maintained
- [ ] No medical jargon remains untranslated
- [ ] Missing information omitted rather than guessed

## OTHER_QUESTIONS GUIDANCE
Develop 5 questions specific to the protocol that address common concerns beyond basic study details. Examples include:
- Radiation exposure concerns for imaging studies
- Anemia worries for frequent blood draws  
- Why so many tests and procedures are needed
- How the study affects their current condition
- Concerns about getting too much of something (scans, blood draws, etc.)

Tailor questions and answers to the specific protocol and provide clear, reassuring responses.`;
