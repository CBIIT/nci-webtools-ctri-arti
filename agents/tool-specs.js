const currentYear = new Date().getFullYear();

const specs = {
  search: {
    toolSpec: {
      name: "search",
      description: `Search the web for up-to-date information, facts, news, and references. Use the current year (${currentYear}) whenever relevant. Always remember to use the browse tool to follow up on relevant search results, and to use search wisely (eg: don't keep searching for the same terms - use maximally disjoint searches to retrieve diverse information).`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: `Search query term. Use operators like quotes for exact phrases, site: for specific websites, or filetype: for specific document types. Remember to incorporate the current year (${currentYear}) to retrieve the latest news.`,
            },
          },
        },
      },
    },
  },
  browse: {
    toolSpec: {
      name: "browse",
      description:
        "Provide multiple urls when possible. Extract and read the full content from webpages, PDFs, DOCXs, or multimedia objects. Use this tool to analyze articles, documentation, or any online content from trusted federal sources. Use this to follow up on search results.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            url: {
              type: "array",
              items: { type: "string" },
              description:
                "Full webpage URLs (including http:// or https://). Provide an array of full URLs to analyze. This tool can handle up to 20 urls at once.",
            },
            topic: {
              type: "string",
              description:
                "The specific question or information need about the documents. In your topic, think step by step about why you are accessing this document (for example - relevance to user query or academic interest). Ask clear, focused questions that the document might answer. Start with basic structural questions (e.g., 'What are the main sections of this document?') before asking about specific content. Phrase questions precisely using terminology likely found in the document. For best results, ask one specific question per query rather than multiple questions or vague requests. When asking questions, always include the full context for any question being asked.",
            },
          },
          required: ["url", "topic"],
        },
      },
    },
  },
  data: {
    toolSpec: {
      name: "data",
      description:
        "Access data files from S3 buckets. List available files by omitting the key parameter, or fetch specific file contents for analysis. Supports CSV, JSON, text, and other file formats.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            bucket: {
              type: "string",
              description: "The S3 bucket name to access.",
            },
            key: {
              type: "string",
              description: "The file path to fetch. Omit to list all available files.",
            },
          },
          required: ["bucket"],
        },
      },
    },
  },
  editor: {
    toolSpec: {
      name: "editor",
      description:
        "Use this tool to view and edit your memory files with precise editing capabilities. Do not use this tool for any other purpose. Use the memory editor tool to view your memories (stored as text files), make targeted text replacements, create new files, insert content at specific locations, and undo previous edits.\n\n**IMPORTANT FOR MULTI-LINE TEXT:**\n- When working with multi-line text in parameters like `old_str`, `new_str`, or `file_text`, use literal line breaks in your JSON values.\n- For `str_replace` command, the text to replace must exist exactly once in the file, including all line breaks.\n- The old_str parameter cannot be empty for str_replace operations.\n",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            command: {
              type: "string",
              enum: ["view", "str_replace", "create", "insert", "undo_edit"],
              description:
                "The operation to perform on the file. Required for all commands. View the file, replace a string, create a new file, insert text at a specific line, or undo the last edit.",
            },
            path: {
              type: "string",
              description: "Path to the file to view or modify. Required for all commands.",
            },
            view_range: {
              type: "array",
              items: { type: "integer" },
              minItems: 2,
              maxItems: 2,
              description:
                "Optional array of two integers specifying the start and end line numbers to view (1-indexed, -1 for end of file). Only used with 'view' command.",
            },
            old_str: {
              type: "string",
              description:
                "The text to replace (must match exactly one location). ONLY use this to replace existing text. To insert a new line, simply use new_str. For multi-line text, use literal line breaks in your JSON values. Required for 'str_replace' command and cannot be empty. To replace empty content, use insert_line instead.",
            },
            new_str: {
              type: "string",
              description:
                "The new text to insert in place of the old text (for 'str_replace') or text to insert at insert_line (for 'insert'). For multi-line text, use literal line breaks in your JSON values. Required for 'str_replace' and 'insert' commands.",
            },
            file_text: {
              type: "string",
              description:
                "The content to write to a new file. For multi-line text, use literal line breaks in your JSON values. Required for 'create' command.",
            },
            insert_line: {
              type: "integer",
              description:
                "The line number after which to insert text (0 for beginning of file). Required for 'insert' command.",
            },
          },
          required: ["command", "path"],
        },
      },
    },
  },
  think: {
    toolSpec: {
      name: "think",
      description:
        "Use this tool to create a dedicated thinking space for complex reasoning. Include the complete information you need to analyze in the thought parameter - providing the full content that needs analysis. This tool is most valuable when processing search results, analyzing documents, planning multi-step implementations, or evaluating complex tradeoffs.",
      inputSchema: {
        json: {
          type: "object",
          properties: {
            thought: {
              type: "string",
              description:
                "The complete information to analyze, including relevant context, data, and constraints. Include the full content that needs analysis.",
            },
          },
          required: ["thought"],
        },
      },
    },
  },
  code: {
    toolSpec: {
      name: "code",
      description:
        'Run self-contained single-file javascript or html programs for any purpose. **JavaScript** — browser-based (no node.js). perform fast one-off calculations, test algorithms, or experiment with browser-friendly libraries (e.g. transformers.js) via CDN ES-module imports (eg: import { AutoModel } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.2/+esm").  **HTML** — render mini web applications or UI prototypes on the fly; ideal for visualising results, building interactive widgets, or sketching layouts.\n\nJust pass the `language`, your `source` code, and (optionally) a `timeout` in milliseconds. The tool returns an object that includes any captured console output (`logs`) and, for HTML, the rendered markup (`html`).',
      inputSchema: {
        json: {
          type: "object",
          properties: {
            language: {
              type: "string",
              description: 'Execution context: "javascript", or "html".',
              enum: ["javascript", "html"],
            },
            source: {
              type: "string",
              description: "The code to execute.",
            },
            timeout: {
              type: "number",
              description:
                "Maximum runtime in milliseconds before the sandbox is terminated (default = 5000).",
              default: 5000,
            },
          },
          required: ["language", "source"],
        },
      },
    },
  },
  docxTemplate: {
    toolSpec: {
      name: "docxTemplate",
      description:
        'Fill out DOCX documents by finding and replacing text in blocks. Without replacements: returns the document\'s text as numbered blocks (paragraphs and table cells) with style info and row/col for cells. With replacements: use text-based keys ("original text": "new text") or index-based keys ("@0": "replacement for block 0") to fill in content.',
      inputSchema: {
        json: {
          type: "object",
          properties: {
            docxUrl: {
              type: "string",
              description: "URL to the DOCX document. Supports s3://bucket/key or https:// URLs.",
            },
            replacements: {
              type: "object",
              description:
                'Map of replacements. Use text keys for text-based replacement (use only when text spans a single block): {"text to find": "replacement"}. In most cases, use @index keys for index-based replacement: {"@0": "text for block 0", "@5": "text for block 5"}. Both modes can be mixed. Index-based is useful for long text, text that needs to be deleted, table cells or blocks with duplicate/empty content.',
            },
          },
          required: ["docxUrl"],
        },
      },
    },
  },
};

export function getToolSpecs(toolNames) {
  if (!toolNames) return Object.values(specs);
  return toolNames.map((name) => specs[name]).filter(Boolean);
}

export default specs;
