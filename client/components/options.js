export const defaultModel = "anthropic.claude-3-haiku-20240307-v1:0";

export const models = [
  {
    group: "AI21 Labs",
    options: [
      {
        label: "Jamba 1.5 Large",
        value: "ai21.jamba-1-5-large-v1:0",
        inputCost1kTokens: 0.002,
        outputCost1kTokens: 0.008,
      },
      {
        label: "Jamba 1.5 Mini",
        value: "ai21.jamba-1-5-mini-v1:0",
        inputCost1kTokens: 0.0002,
        outputCost1kTokens: 0.0004,
      },
    ],
  },
  {
    group: "Amazon",
    options: [
      {
        label: "Titan Text Premier",
        value: "amazon.titan-text-premier-v1:0",
        inputCost1kTokens: 0.0005,
        outputCost1kTokens: 0.0015,
      },
      {
        label: "Titan Text G1 - Express",
        value: "amazon.titan-text-express-v1",
        inputCost1kTokens: 0.0002,
        outputCost1kTokens: 0.0006,
      },
      {
        label: "Titan Text G1 - Lite",
        value: "amazon.titan-text-lite-v1",
        inputCost1kTokens: 0.00015,
        outputCost1kTokens: 0.0002,
      },
    ],
  },
  {
    group: "Anthropic",
    options: [
      {
        label: "Claude 3.5 Sonnet",
        value: "anthropic.claude-3-5-sonnet-20240620-v1:0",
        inputCost1kTokens: 0.003,
        outputCost1kTokens: 0.015,
      },
      {
        label: "Claude 3 Opus",
        value: "anthropic.claude-3-opus-20240229-v1:0",
        inputCost1kTokens: 0.015,
        outputCost1kTokens: 0.075,
      },
      {
        label: "Claude 3 Sonnet",
        value: "anthropic.claude-3-sonnet-20240229-v1:0",
        inputCost1kTokens: 0.003,
        outputCost1kTokens: 0.015,
      },
      {
        label: "Claude 3 Haiku",
        value: "anthropic.claude-3-haiku-20240307-v1:0",
        inputCost1kTokens: 0.00025,
        outputCost1kTokens: 0.00125,
      },
    ],
  },
  {
    group: "Cohere",
    options: [
      { label: "Command R+", value: "cohere.command-r-plus-v1:0", inputCost1kTokens: 0.003, outputCost1kTokens: 0.015 },
      { label: "Command R", value: "cohere.command-r-v1:0", inputCost1kTokens: 0.0005, outputCost1kTokens: 0.0015 },
    ],
  },
  {
    group: "Meta",
    options: [
      // { label: "Llama 3.2 90B Instruct", value: "meta.llama3-2-90b-instruct-v1:0" },
      // { label: "Llama 3.2 11B Instruct", value: "meta.llama3-2-11b-instruct-v1:0" },
      // { label: "Llama 3.2 3B Instruct", value: "meta.llama3-2-3b-instruct-v1:0" },
      // { label: "Llama 3.2 1B Instruct", value: "meta.llama3-2-1b-instruct-v1:0" },
      {
        label: "Llama 3 70B Instruct",
        value: "meta.llama3-70b-instruct-v1:0",
        inputCost1kTokens: 0.00265,
        outputCost1kTokens: 0.0035,
      },
      {
        label: "Llama 3 8B Instruct",
        value: "meta.llama3-8b-instruct-v1:0",
        inputCost1kTokens: 0.0003,
        outputCost1kTokens: 0.0006,
      },
    ],
  },
  {
    group: "Mistral AI",
    options: [
      {
        label: "Mistral Large 2 (24.02)",
        value: "mistral.mistral-large-2402-v1:0",
        inputCost1kTokens: 0.004,
        outputCost1kTokens: 0.012,
      },
      {
        label: "Mistral Small",
        value: "mistral.mistral-small-2402-v1:0",
        inputCost1kTokens: 0.001,
        outputCost1kTokens: 0.003,
      },
      {
        label: "Mixtral 8X7B Instruct",
        value: "mistral.mixtral-8x7b-instruct-v0:1",
        inputCost1kTokens: 0.00045,
        outputCost1kTokens: 0.0007,
      },
    ],
  },
];

export function getModelLabel(value) {
  return models
    .map((o) => o.options)
    .flat()
    .find((o) => o.value === value)?.label;
}

export function getInferenceCost(model, inputTokens, outputTokens) {
  const { inputCost1kTokens, outputCost1kTokens } = models
    .map((o) => o.options)
    .flat()
    .find((o) => o.value === model);
  return inputTokens * inputCost1kTokens + outputTokens * outputCost1kTokens;
}

export const defaultWorkspaces = [
  {
    id: 0,
    model: defaultModel,
    title: "Summarize",
    prompt: `You are tasked with summarizing a document. Your goal is to create a concise and informative summary that captures the main points and key ideas of the original text. Here's how to approach this task:

1. Identify the main topic or central idea of the document.
2. Determine the key points that support or elaborate on the main topic.
3. Look for any important details, examples, or evidence that are crucial to understanding the document's content.
4. Identify any conclusions or final thoughts presented in the document.

When writing your summary:
- Aim for a length of about 10-20% of the original document, unless otherwise specified.
- Use your own words to paraphrase the main ideas and key points.
- Maintain a neutral tone and avoid including your own opinions or interpretations.
- Present the information in a logical order, which may not necessarily be the same as the original document.
- Do not include minor details, examples, or tangential information that isn't crucial to the main ideas.
- Ensure that your summary can stand alone and be understood without reference to the original document.

Before writing your summary, you may use <scratchpad> tags to organize your thoughts and outline the main points you plan to include. Please provide your summary within <summary> tags, after the <scratchpad>. 

The document to be summarized is provided below:`,
    results: [],
  },
  {
    id: 1,
    model: "mistral.mistral-large-2402-v1:0",
    title: "Translate to Spanish",
    prompt: `You are a skilled translator tasked with translating a document from English to Spanish. Your goal is to provide an accurate and natural-sounding translation that preserves the meaning and tone of the original document.

Please follow these guidelines when translating:
1. Read the entire text carefully to understand its context and meaning.
2. Translate the text into Spanish, maintaining the original meaning and tone as closely as possible.
3. Use appropriate Spanish vocabulary and grammar, considering regional variations if necessary.
4. Preserve any formatting, punctuation, or special characters present in the original text.
5. If there are any idioms, cultural references, or phrases that don't have a direct Spanish equivalent, provide the most appropriate translation that conveys the same meaning.
6. If you encounter any terms that you're unsure about or that might have multiple translations, choose the most suitable option based on the context.

After completing the translation, please provide your output in the following format:

<translation>
[Insert your Spanish translation here]
</translation>

If you have any notes or explanations about specific translation choices, please include them before the translation, enclosed in <translator_notes> tags.

Here is the document you need to translate:`,
    results: [],
  },
  {
    id: 2,
    model: defaultModel,
    title: "Protocol Eligibility",
    prompt: `You are an AI assistant tasked with extracting patient eligibility criteria from a clinical trial document. Your goal is to create a schema for the eligibility criteria and then use that schema to extract the relevant information. 
This task is crucial for determining patient eligibility for clinical trials accurately. Follow these steps in order to complete this task:

1. Create a schema for patient eligibility criteria:
   - Include categories for inclusion criteria and exclusion criteria
   - Consider subcategories within these, such as age, diagnosis, medical history, lab values, and other relevant criteria
   - Create a valid JSON schema with type, definition, and example values
   - Use your expertise to determine the most appropriate structure based on the document content

2. Extract the patient eligibility criteria from the document:
   - Use the schema you created as a guide for organizing the information
   - Ensure you capture all relevant criteria, including numerical values, time frames, and specific medical conditions or treatments

3. Organize the extracted information into a JSON format:
   - The JSON structure should reflect your created schema
   - Use main categories for inclusion and exclusion criteria
   - Create nested objects or arrays for subcategories and specific criteria
   - Include an "additional_criteria" category for any criteria that don't fit neatly into your schema

4. For each criterion:
   - Include the section number from the original document (e.g., 3.211, 3.229a) to maintain traceability
   - If a criterion is unclear or seems to contradict another, add a "notes" field with your observations

Provide your output in the following format:

<schema>
[Insert your created schema here]
</schema>

<extracted_criteria>
[Insert your JSON-formatted extracted criteria here]
</extracted_criteria>

Remember to be thorough and accurate in your extraction, as this information is crucial for determining patient eligibility for the clinical trial. Double-check your work to ensure all relevant information has been captured and properly formatted. Only return the schema and extracted_criteria in your output. 
Now, carefully read and analyze the following clinical trial document using the steps outlined above:
`,
    results: [],
  },
  {
    id: 3,
    model: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    title: "Protocol Simplification",
    prompt: `You will be given a clinical trial protocol document. Your task is to extract specific information from this document and summarize it in a way that a 6th grader can understand. Follow these steps:

1. Read the entire protocol document carefully.

2. Extract and summarize the following sections from the protocol. Use only information provided in the document. If any section is not explicitly mentioned in the protocol, state "Not specified in the protocol." For each section, simplify the language to a 6th-grade reading level. Also include the text of the document from which this information was sourced.

3. Present your findings in the following format, using the specified XML tags:

<protocol_summary>

<title>
Write the exact Protocol Title as it appears in the document.
</title>

<pi_and_contacts>
List the Principal Investigator (PI) and contact information exactly as provided in the protocol.
</pi_and_contacts>

<trial_sites>
Summarize the trial sites mentioned in the protocol. If diverse populations are specifically mentioned, include this information.
</trial_sites>

<aim_purpose>
Provide a 1-2 sentence summary of the study's aim or purpose.
</aim_purpose>

<diversity_goals>
List any defined diversity goals mentioned in the protocol. If none are specified, state this.
</diversity_goals>

<health_equity_committee>
Mention any involvement of a Health Equity Committee in designing the study. If not mentioned, state this.
</health_equity_committee>

<eligibility>
In 1-2 sentences, describe who is eligible to participate. Include any mentions of race/ethnicity, sex/gender, age, geography, comorbid conditions, or disabilities. Note any inclusion criteria that might make it difficult for diverse populations to qualify.
</eligibility>

<exclusions>
If specific segments of the population are excluded, explain why, based on information in the protocol.
</exclusions>

<recruitment_strategies>
Summarize the recruitment strategies mentioned, including any efforts to ensure enrollment of underserved populations or use of inclusive recruitment materials.
</recruitment_strategies>

<study_focus>
Describe what the study will focus on (medication/device/intervention/observation) and how it differs from current practice.
</study_focus>

<study_procedures>
Summarize the main study procedures, including specific tests, clinic visits, and surveys/questionnaires. Mention if there are measures capturing social determinants of health.
</study_procedures>

<benefits>
Describe the potential benefits of the study, including whether participants will directly benefit.
</benefits>

<risks>
Summarize the main risks of participating in the study.
</risks>

<analysis_plan>
Mention any specific analysis plans related to race, ethnicity, gender identity, etc.
</analysis_plan>

<study_materials>
Describe any information about the grade level of informed consent forms and availability of translators.
</study_materials>

<social_economic_factors>
Summarize how the study addresses social and economic determinants of health, including financial support, transportation, food access, and housing stability.
</social_economic_factors>

<patient_advocates>
Mention any involvement of patient advocates in evaluating the study design, if specified in the protocol.
</patient_advocates>

</protocol_summary>

Remember to use simple language that a 6th grader can understand throughout your summary. Only include information that is explicitly stated in the provided protocol document. Remember to cite the original passages used in a <references> section. The <references> section should contain a tag for each parsed section which contains the text from the document which was used to source this data.
Now, carefully read and analyze the following clinical trial protocol document using the steps outlined above: 
`,
    results: [],
  },
];

export const newWorkspace = {
  model: defaultModel,
  title: "New Workspace",
  prompt: "",
  results: [],
};
