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
      description: `Virtual filesystem. Create, view, edit, delete, rename files. Use freely for organizing work, drafting documents, storing data, and maintaining persistent context.

Examples:
- List all files: { "command": "view", "path": "/" }
- List directory: { "command": "view", "path": "memories/" }
- View file: { "command": "view", "path": "notes.txt" }
- View lines 1-10: { "command": "view", "path": "notes.txt", "view_range": [1, 10] }
- Create file: { "command": "create", "path": "plan.md", "file_text": "# Plan\\n..." }
- Edit file: { "command": "str_replace", "path": "plan.md", "old_str": "draft", "new_str": "final" }
- Insert at line: { "command": "insert", "path": "plan.md", "insert_line": 3, "new_str": "new line" }
- Delete file: { "command": "delete", "path": "old-notes.txt" }
- Rename file: { "command": "rename", "path": "old.txt", "new_path": "new.txt" }

memories/ and skills/ persist across conversations. All other files are conversation-scoped.`,
      inputSchema: {
        json: {
          type: "object",
          properties: {
            command: {
              type: "string",
              enum: ["view", "create", "str_replace", "insert", "delete", "rename"],
              description:
                "The operation to perform. view: show file content or list directory. create: make a new file (errors if exists). str_replace: replace text (must match exactly once). insert: add text at line number. delete: remove a file. rename: move a file to a new path.",
            },
            path: {
              type: "string",
              description:
                "File or directory path. Use trailing / for directory listing. Leading/trailing slashes are normalized.",
            },
            view_range: {
              type: "array",
              items: { type: "integer" },
              minItems: 2,
              maxItems: 2,
              description:
                "Optional [start, end] line range for view (1-indexed, -1 for end of file).",
            },
            old_str: {
              type: "string",
              description:
                "Text to find and replace (must match exactly once). Required for str_replace.",
            },
            new_str: {
              type: "string",
              description:
                "Replacement text for str_replace, or text to insert for insert command.",
            },
            file_text: {
              type: "string",
              description: "Content for a new file. Required for create.",
            },
            insert_line: {
              type: "integer",
              description:
                "Line number after which to insert text (0 = beginning). Required for insert.",
            },
            new_path: {
              type: "string",
              description: "Destination path for rename. Required for rename.",
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
