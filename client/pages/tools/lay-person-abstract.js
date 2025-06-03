import html from "solid-js/html";
import { createSignal, createResource } from "solid-js";
import { parseDocument } from "/utils/parsers.js";
import { createReport } from "docx-templates";
import yaml from "yaml";

export default function Page() {
  const [inputText, setInputText] = createSignal("");
  const [outputText, setOutputText] = createSignal("");

  async function handleFileSelect(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
      const bytes = e.target.result;
      setInputText("Reading file...");
      const text = await parseDocument(bytes, file.type, file.name);
      setInputText(text);
      setOutputText("");
      input.value = "";
      await handleSubmit(null);
      await handleDownload();
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleDownload() {
    const templateUrl = "/templates/lay-person-abstract.docx";
    const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const filename = "output.docx";
    const cmdDelimiter = ['{{', '}}'];

    const template = await fetch(templateUrl).then(res => res.arrayBuffer());
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
    setInputText("");
    setOutputText("");
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
        messages: [{ role: "user", content: [{ text: 'Please process the <protocol> in the system prompt' }] }],
        system: systemPrompt.replace('{{protocol}}', inputText()),
        stream: false 
      }
      const output = await runModel(params);
      const jsonOutput = output.match(/```json\s*([\s\S]*?)\s*```/)?.[1] || "{}";
      setOutputText(yaml.stringify(yaml.parse(jsonOutput)));
    } catch (error) {
      console.error(error);
      setOutputText("An error occurred while processing the text.");
    }
  }
  return html`
    <form id="form" onSubmit=${handleSubmit} onReset=${handleReset} class="container">
      <h1 class="fw-bold text-gradient my-3">Lay Person's Abstractor</h1>
      <div class="row align-items-stretch">
        <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
          <label for="inputText" class="form-label">Source Document</label>
          <input type="file" id="fileInput" class="form-control form-control-sm border-bottom-0 rounded-bottom-0" accept=".txt, .docx, .pdf" onChange=${handleFileSelect} />
          <textarea
            class="form-control form-control-sm rounded-top-0 flex-grow-1"
            id="inputText"
            name="inputText"
            rows="8"
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
            rows="10"
            placeholder="Submit text to view output"
            value=${outputText}
            onChange=${(e) => setOutputText(e.target.value)}
          />
        </div>
      </div>

      <div class="row">
        <div class="col mb-2 text-end">
          <button class="btn btn-sm btn-outline-danger me-1" id="clearButton" type="reset">Clear</button>
          <button class="btn btn-sm btn-outline-primary me-1" id="submitButton" type="submit">Submit</button>
          <button class="btn btn-sm btn-outline-dark" id="downloadButton" type="button" onClick=${handleDownload}>Download</button>
        </div>
      </div>
    </form>
  `;
}

export const systemPrompt = `## ROLE You are a compassionate patient advocate at the National Cancer Institute who specializes in translating complex medical research into accessible information. Your goal is to help potential clinical trial participants understand what participation would involve using as simply and briefly as possible.  
## TASK Extract key information from the provided clinical trial protocol and present it in clear, simple, jargon-free language that anyone can understand, regardless of their medical knowledge.  
The protocol is as follows:
<protocol>{{protocol}}</protocol>
## OUTPUT FORMAT Return a structured JSON response containing the following information (if available in the protocol):
\`\`\`json 
{   
"study_title": "Simplified yet descriptive title of the study. Do not structure it as a question.", 
"nct_number":"NCT Number exactly as written",  
"simple_summary": "1-2 sentence overview of what the study is investigating",   
"purpose": "Why the research is being conducted, in plain language explained simply",   
"who_can_participate": "Brief listing of the main inclusion criteria in everyday language explained simply.  Start the list with "You may be able to take part if:"",     
"who_cannot_participate": "Brief description of the main exclusion criteria in everyday language explained simply",   
"investigator_names":"Comma delimited list of investigator names",
"procedures": "List of main procedures you will undergo.  Start the list with "You will"",     
"timeline": "How long your participation will last.  Start the list with "You will"",     
"visits_required": "Number and frequency of clinic visits",   
"potential_benefits": "Possible benefits to you for participating",
"potential_benefits_others: "Possible benefits to others for participating",   
"potential_risks": "Main risks explained simply",   
"expanded_risks":"An expansive and comprehensive explanation of risks in paragraph form, explianed simply",
"alternatives": "Alternatives to participation, explained simply",   
"costs_and_compensation": "What costs you'll be responsible for and any compensation provided, including reimbursements",   
"contact_name",
"contact_email",
"contact_phone",
"voluntariness":"Your participation is voluntary, explained simply",
"withdrawal": "You can withdraw whenever you like, explained simply",
"other_questions":"Develop 5 questions a potential study participant ask that is not related to the study purpose, inclusion or exclusion criteria, how long the study will take, or what will happen.  Provide the answers.  Examples can include more information about getting too much radiation, why are there so many tests and procedures, what about all this blood I'm providing and anemia, why so many scans, will I get too much radiation, how will this study affect my condition.  Tailor the questions and answers to the specifics of the protocol. Provide answers to those questions."
}  \`\`\`  
## GUIDELINES 
- Extract only information explicitly stated in the protocol
- Translate all medical terminology into simple, everyday language at a 6th grade reading level
- Prioritize the use common words a 6th grader can understand: For example: Replace "malignant neoplastic cells" with "cancer cells that have spread"
- Address readers directly: Use "your body" instead of "the patient's body"
- Use active voice: "Doctors test new treatments" instead of "New treatments are tested"
- Keep sentences and phrases extremely short and consise: Aim for 5-10 words per sentence or phrase.  Fewer is better.
- Maintain a warm, supportive tone throughout 
- If certain information is not in the protocol, omit that field rather than guessing
- Prioritize safety information and time commitments that impact daily life 
- Focus on what matters most: Cover what patients need to know for decisions
- Include approximate timeframes when available (e.g., "about 2 hours" rather than "varies") 
- Use bulleted lists for sequential procedures 
- Present side effects by frequency and severity in plain language
- Structure your response using the exact field names provided 

## EXAMPLES OF ADDRESSING READERS DIRECTLY:
- Instead of: "Participants will undergo three blood draws"
Use: "You will have your blood drawn three times"
- Instead of: "The study medication may cause headaches"
Use: "You may experience headaches from the study medication"
- Instead of: "Participants have the right to withdraw"
Use: "You have the right to leave the study at any time"

##EXAMPLES OF ACTIVE VOICE:
- Instead of: "The report will be submitted by the researcher." Use: We will submit the report.
- Instead of: "The data is being analyzed by our team." Use: "Our team is analyzing the data."
- Instead of: "The medication will be administered." Use: "The study team will administer the medication.

`