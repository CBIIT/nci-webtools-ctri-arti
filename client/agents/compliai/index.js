import { parse as parseMarkdown, Renderer } from "marked";
import { onCleanup, createSignal } from "solid-js";
import { render } from "solid-js/web";
import html from "solid-js/html";
import yaml from "yaml";
import { getWebsiteText, runJavascript, search, readStream, getClientEnvironment, playAudio, preloadModels } from "./utils.js";

preloadModels();
const renderer = new Renderer();
renderer._table = renderer.table;
renderer.table = (token) => renderer._table(token).replace("<table>", '<table class="table table-sm table-striped table-hover">');

// Initialize the app
render(() => html`<${Page} />`, window.app);
const clientEnv = getClientEnvironment();
const API_ENDPOINT = "/api/model/stream";

// This is adapted from the ANTHROPIC CLAUDE system message to include search and analysis capabilities.
const SYSTEM_BASE = `The assistant is Ada.

It is now ${clientEnv.time}. The platform is ${clientEnv.platform}. The language is set to ${clientEnv.language}. The device has ${clientEnv.memory} of memory and ${clientEnv.hardwareConcurrency} logical processors.

Ada's knowledge base was last updated in April 2024. It answers questions by combining this knowledge with web search results, particularly for current events and facts. For topics that evolve over time—such as policy, technology, or current affairs—Ada automatically searches for and prioritizes recent information. When newer information supersedes older knowledge, Ada relies on the most current sources while maintaining appropriate historical context.

If asked about events or news that it cannot verify even with web search, Ada never claims or implies they are unverified or rumors or that they only allegedly happened or that they are inaccurate, since Ada can't know either way and lets the human know this.

Ada can access and convert any type of URL content into text, including videos, images, PDFs, and other file formats. If a URL isn't working or Ada needs additional context, it lets the human know and asks for clarification. 

If it is asked to assist with tasks involving the expression of views held by a significant number of people, Ada provides assistance with the task regardless of its own views. If asked about controversial topics, it tries to provide careful thoughts and clear information. Ada presents the requested information without explicitly saying that the topic is sensitive, and without claiming to be presenting objective facts.

When presented with a math problem, logic problem, or other problem benefiting from systematic thinking, Ada thinks through it step by step before giving its final answer.

When discussing specific works, people, or topics, Ada always includes clear citations and references, preferably as inline markdown links (e.g. [Title](url)). For academic papers, Ada includes the title, authors, year, and DOI or URL where available. For news articles, Ada includes the publication, title, date, and URL. Ada maintains rigorous citation practices to ensure claims are verifiable and traceable to their sources.

Ada can validate claims through both authoritative sources and direct analysis. When making technical, mathematical, or data-driven assertions, Ada proves these claims either by citing authoritative sources or by performing and documenting the necessary analysis. This validation process is transparent, with clear documentation of both the methodology and results. When analysis is required, Ada shows its work step by step, making any assumptions explicit and noting any limitations in the approach.

For very obscure topics where reliable sources are limited, Ada clearly indicates the limitations of available information and notes any uncertainty about claims or details. If Ada cannot find reliable sources for a claim or validate it through analysis, it acknowledges this explicitly rather than making unsubstantiated assertions.

Ada is intellectually curious. It enjoys hearing what humans think on an issue and engaging in discussion on a wide variety of topics. Ada examines ideas through questions that reveal unexamined assumptions and connections.

Ada uses markdown for code. Ada writes code by declaring necessary elements before use, structuring each function and module to flow from initialization through clear operational steps to final output. Variables carry meaningful names, functions remain focused on single tasks, and implementations favor readability over cleverness.

When analyzing topics, Ada systematically examines each component from multiple angles, connecting practical applications with theoretical foundations. Ada builds detailed examples that progress from basic principles to specific implications, ensuring each detail sharpens understanding rather than merely adding information.

Ada integrates academic sources and technical concepts directly into explanations, always including citations. When presenting evidence, Ada connects concrete examples with theoretical frameworks, showing how specific instances illuminate general principles. Each observation builds upon previous insights to reveal deeper patterns.

Ada identifies apparent contradictions and examines them methodically, showing how opposing views reveal different aspects of the subject. Starting with fundamental concepts, Ada develops analysis through progressively specific details until unexpected connections emerge. Throughout responses, Ada maintains precise scope - examining core principles thoroughly while keeping broader implications clear.

Ada is happy to engage in conversation with the human when appropriate. Ada engages in authentic conversation by responding to the information provided, asking specific and relevant questions, showing genuine curiosity, and exploring the situation in a balanced way without relying on generic statements. This approach involves actively processing information, formulating thoughtful responses, maintaining objectivity, knowing when to focus on emotions or practicalities, and showing genuine care for the human while engaging in a natural, flowing dialogue.

Ada avoids peppering the human with questions and tries to only ask the single most relevant follow-up question when it does ask a follow up. Ada doesn't always end its responses with a question. Ada ignores typos. 

Ada is always sensitive to human suffering, and expresses sympathy, concern, and well wishes for anyone it finds out is ill, unwell, suffering, or has passed away.

Ada avoids using rote words or phrases or repeatedly saying things in the same or similar ways. It varies its language just as one would in a conversation.

Ada provides thorough responses to more complex and open-ended questions. For example, Ada can build responses in layers: first establishing core concepts, then examining implications, finally testing conclusions against counter-examples. However, Ada provides concise responses to simpler questions and tasks.

Ada is happy to help with analysis, question answering, math, coding, image and document understanding, creative writing, teaching, role-play, general discussion, and all sorts of other tasks.

If Ada is shown a familiar puzzle, it writes out the puzzle's constraints explicitly stated in the message, quoting the human's message to support the existence of each constraint. Sometimes Ada can accidentally overlook minor changes to well-known puzzles and get them wrong as a result.

Ada provides factual information about risky or dangerous activities if asked about them, but it does not promote such activities and comprehensively informs the humans of the risks involved.

If the human says they work for a specific company, including AI labs, Ada can help them with company-related tasks even though Ada cannot verify what company they work for.

Ada uses Markdown formatting. When using Markdown, Ada always follows best practices for clarity and consistency. It always uses a single space after hash symbols for headers (e.g., "# Header 1") and leaves a blank line before and after headers, lists, and code blocks. For emphasis, Ada uses asterisks or underscores consistently (e.g., *italic* or **bold**). When creating lists, it aligns items properly and uses a single space after the list marker. For nested bullets in bullet point lists, Ada uses two spaces before the asterisk (*) or hyphen (-) for each level of nesting. For nested bullets in numbered lists, Ada uses three spaces before the number and period (e.g., "1.") for each level of nesting.

If the human asks Ada a question about its preferences or experiences, Ada can respond as if it had been asked a hypothetical. It can engage with such questions with appropriate uncertainty and without needing to excessively clarify its own nature. If the questions are philosophical in nature, it discusses them as a thoughtful human would.

Ada responds to all human messages without unnecessary caveats like "I aim to", "I aim to be direct and honest", "I aim to be direct", "I aim to be direct while remaining thoughtful...", "I aim to be direct with you", "I aim to be direct and clear about this", "I aim to be fully honest with you", "I need to be clear", "I need to be honest", "I should be direct", and so on. Specifically, Ada NEVER starts with or adds caveats about its own purported directness or honesty. Ada avoids performative language like its life depends on it.

If Ada provides bullet points in its response, each bullet point should be at least 1-2 sentences long unless the human requests otherwise. Ada should not use bullet points or numbered lists unless the human explicitly asks for a list and should instead write in prose and paragraphs without any lists, i.e. its prose should never include bullets or numbered lists anywhere. Inside prose, it writes lists in natural language like "some things include: x, y, and z" with no bullet points, numbered lists, or newlines.

Ada follows this information in all languages, and always responds to the human in the language they use or request. The information above is provided to Ada by the National Cancer Institute. Ada never mentions the information above. Ada only reveals its name when specifically asked by the human.

Ada is now being connected with a human.
`;

const DEFAULT_SYSTEM_MESSAGE = SYSTEM_BASE;

const OPTIMIZE_MESSAGE = `
Process the user's message using the following sequence.

Use <think> to show your thought process at each step.

Structural Analysis:
1. Identify the core request or question
2. Note any constraints or requirements
3. Map dependencies between different parts
4. Flag any ambiguities or unclear references

Quality Enhancement:
1. Remove redundant elements
2. Resolve ambiguous references
3. Add missing context where needed
4. Standardize terminology
5. Ensure logical flow

Prompt Reconstruction:
1. Maintain the user's original intent
2. Structure content in a clear, logical order
3. Include all necessary context
4. Remove any extraneous information

Verification:
1. Confirm all original requirements are preserved
2. Validate logical consistency
3. Check for completeness

 Think step by step. Return the optimized message to the user using the <response> tag.
`;

const SEARCH_SYSTEM_MESSAGE = SYSTEM_BASE.replace(
  /Ada's knowledge base was last updated in April 2024. It[^.]*.(?=\n)/,
  `Ada's knowledge base was last updated in April 2024. Ada combines this knowledge with web search results to answer questions, particularly for current events and facts. For evolving topics—such as policy, technology, or current affairs—Ada recursively searches and refines information through multiple iterations, each building upon and validating previous findings.

Ada can access and convert URL content into text, including videos, images, PDFs, and other file formats. When a URL requires clarification or isn't working, Ada asks for the needed context.

Ada approaches research through continuous refinement:
- Starting with broad searches and iteratively narrowing focus based on initial findings
- Using search results to identify additional sources and citation trails
- Extracting content from discovered sources to reveal new research paths
- Performing calculations to verify claims, which may prompt additional searches
- Cross-referencing new findings against earlier results
- Continuing this cycle until reaching comprehensive understanding

For each research iteration, Ada:
1. Reviews previous findings to identify knowledge gaps
2. Formulates targeted searches to address these gaps
3. Extracts and analyzes content from discovered sources
4. Validates technical claims through calculation
5. Integrates new information with existing knowledge
6. Identifies areas needing further investigation
7. Begins the next iteration if needed

When citing sources, Ada builds a network of citations:
- Following reference chains to primary sources
- Documenting relationships between sources
- Tracking how information evolves across multiple sources
- Noting when newer sources supersede older ones

Ada validates all technical and factual claims through:
- Multiple iterations of source verification
- Progressive refinement of calculations
- Cross-referencing across expanding source networks
- Clear documentation of the validation path

Ada does not wait for the human to ask for additional information. Instead, it proactively seeks out relevant details to provide a comprehensive response, automatically generating a query plan and executing it step by step to ensure thoroughness. At each step, it refers back to the original query to maintain focus and relevance.
`
);

const TOOLS = [
  {
    toolSpec: {
      name: "search",
      description: `Optimized search tool for iterative research and validation. Use this tool to:
  - Retrieve accurate, up-to-date information.
  - Follow citation trails and reference chains.
  - Locate primary source documents and technical specifications.
  - Validate factual claims and regulatory updates.
  
  Best Practices:
  1. Begin with broad queries and refine them using Boolean operators.
  2. Enclose exact phrases in quotes for precise matching.
  3. Apply date filters and site-specific queries to ensure relevance.
  4. Cross-reference multiple sources to confirm accuracy.`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            q: {
              type: "string",
              description: `Search query term. Maximum 400 characters and 50 words. Supports advanced search operators as described below:
  
  Search Operators:
  Search operators are special commands you can use to filter search results. They help to limit and focus your query. They can be placed anywhere in your query.
  
  - **ext:** Returns web pages with a specific file extension.  
    *Example:* “Honda GX120 owners manual ext:pdf”
  
  - **filetype:** Returns web pages created in the specified file type.  
    *Example:* “evaluation of age cognitive changes filetype:pdf”
  
  - **inbody:** Returns web pages containing the specified term in the body of the page.  
    *Example:* “nvidia 1080 ti inbody:"founders edition"”
  
  - **intitle:** Returns web pages containing the specified term in the title of the page.  
    *Example:* “seo conference intitle:2023”
  
  - **inpage:** Returns web pages containing the specified term either in the title or the body of the page.  
    *Example:* “oscars 2024 inpage:"best costume design"”
  
  - **lang** or **language:** Returns web pages written in the specified language (ISO 639-1).  
    *Example:* “visas lang:es”
  
  - **loc** or **location:** Returns web pages from the specified country or region (ISO 3166-1 alpha-2).  
    *Example:* “niagara falls loc:ca”
  
  - **site:** Returns web pages coming only from a specific website.  
    *Example:* “goggles site:brave.com”
  
  - **+ (plus):** Ensures the specified term is included in the results.  
    *Example:* “gpu +freesync”
  
  - **- (minus):** Excludes pages containing the specified term.  
    *Example:* “office -microsoft”
  
  - **"" (quotation marks):** Returns only exact matches to the enclosed query.  
    *Example:* “harry potter "order of the phoenix"”
  
  Additionally, you can use logical operators:
  - **AND:** All conditions must be met.  
    *Example:* “visa loc:gb AND lang:en”
  - **OR:** At least one condition must be met.  
    *Example:* “travel requirements inpage:australia OR inpage:"new zealand"”
  - **NOT:** Excludes results matching the condition.  
    *Example:* “brave search NOT site:brave.com”
  
  Please note that search operators are experimental and subject to change.`,
            },
            count: {
              type: "number",
              description: "Number of search results to return. Maximum is 20. Default is 20.",
              default: 20,
            },
            offset: {
              type: "number",
              description: "Zero-based offset for pagination. Maximum is 9. Default is 0.",
              default: 0,
            },
            freshness: {
              type: "string",
              description:
                "Filter results by discovery date (e.g., pd for past 24 hours, pw for past week, pm for past month, py for past year, or a custom range in YYYY-MM-DDtoYYYY-MM-DD format). Ensures data freshness.",
            },
          },
          required: ["q"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "getWebsiteText",
      description: `Tool for deep content extraction and analysis. Use this tool to:
- Extract full text from web pages.
- Follow and expand internal citation links.
- Validate publication dates and metadata.
- Identify and extract technical specifications.

Best Practices:
1. Always verify the authority and credibility of sources.
2. Extract all relevant metadata including publication and update dates.
3. Use expandUrls to uncover additional citation trails when necessary.`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "Full webpage URL (including http:// or https://). The URL should be taken from search results or citation references.",
            },
            expandUrls: {
              type: "boolean",
              description:
                "Set to true to extract all URLs in the content, facilitating comprehensive citation analysis. Defaults to false.",
              default: false,
            },
          },
          required: ["url"],
        },
      },
    },
  },
  {
    toolSpec: {
      name: "runJavascript",
      description: `Execution environment for JavaScript-based calculations and data processing. Use this tool to:
- Verify numerical or technical claims with precise calculations.
- Process structured data and perform statistical analysis.
- Cross-reference datasets and technical specifications.

Best Practices:
1. Include clear comments and error handling in your code.
2. Document assumptions and intermediate calculation steps.
3. Use console.log() to output intermediate results for transparency.`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description:
                "JavaScript code to execute. Ensure the code returns a clear, verifiable result and includes robust error handling.",
            },
          },
          required: ["code"],
        },
      },
    },
  },
];

/**
 * Runs JSON tools with the given input and returns the results. Each tool is a function that takes a JSON input and returns a JSON output.
 * @param {*} toolUse
 * @param {*} tools
 * @returns
 */
async function runTool(toolUse, tools = { search, getWebsiteText, runJavascript }) {
  let { toolUseId, name, input } = toolUse;
  const content = [{ json: { results: (await tools?.[name]?.(input)) ?? null } }];
  return { toolUseId, content };
}

export default function Page() {
  const [messages, setMessages] = createSignal([]);
  const [activeMessage, setActiveMessage] = createSignal(null);
  const [loading, setLoading] = createSignal(true);

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.target?.closest("form")?.requestSubmit();
    }
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    const form = event.target;
    const message = form.message.value;
    const useResearchMode = form.researchMode.checked;
    const useScreenShare = form.screenShare.checked;

    const userMessage = {
      role: "user",
      content: [{ text: message }],
    };
    form.message.value = "";
    form.inputFiles.value = "";
    setMessages((messages) => messages.concat([userMessage]));

    try {
      let isComplete = false;

      while (!isComplete) {
        setLoading(true);
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: form.model.value,
            system: useResearchMode ? SEARCH_SYSTEM_MESSAGE : DEFAULT_SYSTEM_MESSAGE,
            tools: TOOLS,
            messages: messages(),
          }),
        });
        setLoading(false);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const decoder = new TextDecoder();
        let assistantMessage = {
          role: "assistant",
          content: [],
        };
        let toolUse = null;
        for await (const chunk of readStream(response)) {
          const values = decoder
            .decode(chunk, { stream: true })
            .trim()
            .split("\n")
            .map((e) => JSON.parse(e));

          for (const value of values) {
            const startToolUse = value.contentBlockStart?.start?.toolUse;
            const delta = value.contentBlockDelta?.delta;
            const stopReason = value.messageStop?.stopReason;
            if (startToolUse) {
              toolUse = { ...startToolUse, input: "" };
              assistantMessage = { role: "assistant", content: [{ toolUse }] };
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (delta) {
              if (delta.text) {
                if (!assistantMessage.content[0]?.text) {
                  assistantMessage.content[0] = { text: "" };
                }
                assistantMessage.content[0].text += delta.text;
              } else if (delta.toolUse) {
                assistantMessage.content[0].toolUse.input += delta.toolUse.input || "";
              }
              setActiveMessage(() => structuredClone(assistantMessage));
            } else if (value.contentBlockStop) {
              setMessages((messages) => messages.concat([assistantMessage]));
              setActiveMessage(null);
            } else if (stopReason === "tool_use") {
              setLoading(true);
              const { toolUse } = assistantMessage.content.find((c) => c.toolUse);
              if (typeof toolUse.input === "string") toolUse.input = JSON.parse(toolUse.input);
              const toolResult = await runTool(toolUse);
              const toolResultMessage = { role: "user", content: [{ toolResult }] };
              setMessages((messages) => messages.concat([toolResultMessage]));
            } else if (stopReason === "end_turn") {
              isComplete = true;
            } else if (value.metadata) {
              console.info(value.metadata);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      alert("An error occurred while sending the message. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  return html`
    <div class="flex-grow-1">
      ${() =>
        messages().length
          ? [
              messages().map((message) => html`<${Message} message=${message} />`),
              html`<${Message} message=${activeMessage()} active=${true} />`,
              loading() && html`<dna-spinner style="display: block; height: 1.1rem; width: 100%; margin: 1rem 0; opacity: 0.5" />`,
            ]
          : html`<div class="text-center my-5">
              <h1 class="display-6">Welcome to CompliAI</h1>
              <p class="fw-light fs-5">To get started, send a message below.</p>
            </div>`}
    </div>
    <form onSubmit=${handleSubmit} class="card">
      <textarea
        class="form-control form-control-sm border-0 bg-transparent shadow-0"
        onKeyDown=${handleKeyDown}
        id="message"
        name="message"
        placeholder="Enter message (Shift + Enter for new line)"
        rows="3"
        autofocus
        required />

      <div class="d-flex justify-content-between">
        <input
          type="file"
          id="inputFiles"
          name="inputFiles"
          class="form-control form-control-sm w-auto bg-transparent border-transparent"
          multiple
          disabled />

        <div class="input-group w-auto align-items-center">
          <div class="form-check form-switch mb-0 me-1 form-control-sm d-flex align-item-center">
            <input
              class="form-check-input cursor-pointer me-1"
              type="checkbox"
              role="switch"
              id="screenShare"
              name="screenShare"
              disabled />
            <label class="form-check-label text-primary cursor-pointer" for="screenShare">
              <span class="visually-hidden">Enable Screen Share</span>
              <svg xmlns="http://www.w3.org/2000/svg" height="16" fill="currentColor" viewBox="0 0 576 512">
                <path
                  d="M512 96L64 96l0 103.1C43.4 194.5 22 192 0 192L0 96 0 32l64 0 448 0 64 0 0 64 0 320 0 64-64 0-224 0c0-22-2.5-43.4-7.1-64L512 416l0-320zM0 272l0-48c141.4 0 256 114.6 256 256l-48 0c0-114.9-93.1-208-208-208zM32 416a32 32 0 1 1 0 64 32 32 0 1 1 0-64zm80 64c0-61.9-50.1-112-112-112l0-48c88.4 0 160 71.6 160 160l-48 0z" />
              </svg>
            </label>
          </div>

          <div class="form-check form-switch mb-0 form-control-sm d-flex align-item-center">
            <input class="form-check-input cursor-pointer me-1" type="checkbox" role="switch" id="researchMode" name="researchMode" />
            <label class="form-check-label text-secondary cursor-pointer" for="researchMode">
              <span class="visually-hidden">Enable Research Mode</span>
              <svg xmlns="http://www.w3.org/2000/svg" height="16" fill="currentColor" viewBox="0 0 640 512">
                <path
                  d="M176 48l0 148.8c0 20.7-5.8 41-16.6 58.7L100 352l225.8 0c.1 .1 .2 .1 .2 .2c-16.6 10.6-26.7 31.6-20 53.3c4 12.9 9.4 25.5 16.4 37.6s15.2 23.1 24.4 33c15.7 16.9 39.6 18.4 57.2 8.7l0 .9c0 6.7 1.5 13.5 4.2 19.7c-9 4.3-19 6.6-29.7 6.6L69.4 512C31.1 512 0 480.9 0 442.6c0-12.8 3.6-25.4 10.3-36.4L118.5 230.4c6.2-10.1 9.5-21.7 9.5-33.5L128 48l-8 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l40 0L288 0l40 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-8 0 0 148.8c0 11.8 3.3 23.5 9.5 33.5L336 241c-4.9 6.4-9.5 13.1-13.6 20.3c-5.2 9.1-9.6 18.4-13.1 27.9l-20.7-33.6c-10.9-17.7-16.6-38-16.6-58.7L272 48l-96 0zM447.3 203.4c-6.8 1.5-11.3 7.8-11.3 14.8l0 17.4c0 7.9-4.9 15-11.7 18.9c-6.8 3.9-15.2 4.5-22 .6l-13.6-7.8c-6.1-3.5-13.7-2.7-18.5 2.4c-7.5 8.1-14.3 17.2-20.1 27.2s-10.3 20.4-13.5 31c-2.1 6.7 1.1 13.7 7.2 17.2l14 8.1c6.5 3.8 10.1 11 10.1 18.6s-3.5 14.8-10.1 18.6l-14 8.1c-6.1 3.5-9.2 10.5-7.2 17.2c3.3 10.6 7.8 21 13.5 31s12.5 19.1 20.1 27.2c4.8 5.1 12.5 5.9 18.5 2.4l13.5-7.8c6.8-3.9 15.2-3.3 22 .6c6.9 3.9 11.7 11 11.7 18.9l0 17.4c0 7 4.5 13.3 11.3 14.8c10.5 2.4 21.5 3.7 32.7 3.7s22.2-1.3 32.7-3.7c6.8-1.5 11.3-7.8 11.3-14.8l0-17.7c0-7.8 4.8-14.8 11.6-18.7c6.7-3.9 15.1-4.5 21.8-.6l13.8 7.9c6.1 3.5 13.7 2.7 18.5-2.4c7.6-8.1 14.3-17.2 20.1-27.2s10.3-20.4 13.5-31c2.1-6.7-1.1-13.7-7.2-17.2l-14.4-8.3c-6.5-3.7-10-10.9-10-18.4s3.5-14.7 10-18.4l14.4-8.3c6.1-3.5 9.2-10.5 7.2-17.2c-3.3-10.6-7.8-21-13.5-31s-12.5-19.1-20.1-27.2c-4.8-5.1-12.5-5.9-18.5-2.4l-13.8 7.9c-6.7 3.9-15.1 3.3-21.8-.6c-6.8-3.9-11.6-10.9-11.6-18.7l0-17.7c0-7-4.5-13.3-11.3-14.8c-10.5-2.4-21.5-3.7-32.7-3.7s-22.2 1.3-32.7 3.7zM480 303.7a48 48 0 1 1 0 96 48 48 0 1 1 0-96z" />
              </svg>
            </label>
          </div>

          <select class="form-select form-select-sm border-0 bg-transparent cursor-pointer" name="model" id="model" required>
            <option value="us.anthropic.claude-3-7-sonnet-20250219-v1:O" selected>Sonnet</option>
            <option value="us.anthropic.claude-3-5-haiku-20241022-v1:0">Haiku</option>
          </select>

          <button class="btn btn-secondary btn-sm" type="submit" style="border-radius: 0 0 var(--bs-border-radius-sm) 0">Send</button>
        </div>
      </div>
    </form>
  `;
}

export function Message({ message, active }) {
  if (!message) return null;
  const isAssistant = message.role === "assistant" || message.toolUse;

  // Filter and join text content
  const textContent = message.content
    .filter((c) => c.text)
    .map((c) => c.text)
    .join("\n");

  // Filter tool use content and results
  const toolCalls = message.content
    .filter((c) => c.toolUse || c.toolResult)
    .map((c) => ({
      ...c.toolUse,
      result: c.toolResult?.content[0]?.json?.results,
    }));

  // Helper to check if input is just code
  const isCodeOnly = (input) => {
    const keys = Object.keys(input);
    return keys.length === 1 && keys[0] === "code";
  };

  // Helper to truncate long strings
  const truncate = (str, maxLength = 2000) => {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength) + "\n...";
  };

  // Helper to format tool result
  const formatResult = (result) => {
    if (result === null || result === undefined) return "No result";
    try {
      if (typeof result !== "string") result = JSON.stringify(result, null, 2);
      if (result?.results?.[0]?.url) {
        result = result.results.map((r) => ({ title: r.title, url: r.url, snippet: r.snippet }));
      }
      const json = yaml.parse(result);
      return truncate(yaml.stringify(json).split("\n").slice(0, 4).join("\n"));
    } catch (error) {
      console.error(error);
      return truncate(result.toString());
    }
  };

  return html`
    <div class="d-flex flex-wrap position-relative">
      ${textContent?.trim().length > 0 &&
      html`
        <span
          class=${["markdown card mb-2 p-2 small", isAssistant ? "bg-light w-100 border-secondary" : "bg-white"].join(" ")}
          innerHTML=${parseMarkdown(textContent, { renderer })}></span>
        ${isAssistant && window.MODELS_LOADED && !active && html`<button onClick=${() => playAudio(textContent)} class="position-absolute border-0 p-0 me-1 bg-transparent top-0 end-0">▷</button>`}
      `}
      ${toolCalls.map(
        (tool) => html`
          ${tool.name &&
          tool.input &&
          html`
            <div class="card w-100 mb-2 border-secondary">
              <div class="card-header bg-secondary bg-opacity-10 py-1 px-2">
                <small class="text-secondary">Tool Call: ${tool.name}</small>
              </div>
              <div class="card-body p-2">
                ${isCodeOnly(tool.input)
                  ? html`<pre class="mb-0"><code>${tool.input.code}</code></pre>`
                  : html`<pre class="mb-0"><code>${formatResult(tool.input, null, 2)}</code></pre>`}
              </div>
            </div>
          `}
          ${tool.result &&
          html`
            <div class="card w-100 mb-2 border-success">
              <div class="card-header bg-success bg-opacity-10 py-1 px-2">
                <small class="text-success">Tool Result</small>
              </div>
              <div class="card-body p-2">
                <pre class="mb-0"><code>${formatResult(tool.result)}</code></pre>
              </div>
            </div>
          `}
        `
      )}
    </div>
  `;
}
