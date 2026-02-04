# Consent-Crafter v2 Application Specification

## Overview

Consent-Crafter v2 generates informed consent documents from research protocols using **block-based AI extraction**. Rather than simple placeholder filling, it processes template blocks with formatting-aware actions (KEEP/DELETE/REPLACE/INSERT) and uses confidence-based merging across overlapping chunks to handle documents of any length.

## Architecture Principles

1. **Block-Based Extraction**: Templates are parsed into formatted blocks; AI determines action for each block based on formatting cues
2. **Overlapping Chunk Strategy**: Long documents (100+ pages) are chunked with overlap to ensure no context is lost at boundaries
3. **Confidence-Based Merging**: Multiple chunk combinations may produce results for the same block; highest confidence wins
4. **Section-Aware Processing**: Global section map ensures content is placed in correct document sections
5. **Session Persistence**: IndexedDB storage allows session recovery and job retry

## Store Structure

```javascript
const [store, setStore] = createStore({
  // Session
  id: null,

  // Input - single File blob
  inputFile: null,

  // Basic template selection - array of template IDs from config.js
  selectedTemplates: [],

  // Advanced options
  model: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5, // "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  advancedOptionsOpen: false,
  templateSourceType: "predefined", // "predefined" | "custom"
  selectedPredefinedTemplate: "",
  customTemplateFile: null,
  customLibraryUrl: "",

  // Job results - keyed by jobId (UUID)
  generatedDocuments: {
    // [jobId]: {
    //   status: "processing" | "completed" | "error",
    //   blob: Blob | null,
    //   stats: { protocolChunks, templateChunks, totalCombinations, totalBlocks, deleteCount, replaceCount, avgConfidence },
    //   error: string | null,
    //   config: { inputFile, inputText, templateFile, templateId, libraryUrl, model, displayInfo }
    // }
  },

  // Template cache - fetched templates stored as Files
  templateCache: {},

  // Library cache - fetched library text by URL
  libraryCache: {},

  // Extraction progress tracking
  extractionProgress: {
    status: "idle", // 'idle' | 'extracting' | 'chunked' | 'priming' | 'processing' | 'merging' | 'applying' | 'completed' | 'error'
    completed: 0,
    total: 0,
    protocolChunks: 0,
    templateChunks: 0,
  },

  // Timestamps
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
```

## Block-Based Extraction Algorithm

### Core Concept

Templates contain formatted blocks where formatting indicates how to handle each text segment:

| Formatting | Color/Style | Meaning |
|------------|-------------|---------|
| Blue text | `color: "0070C0"` or `"2E74B5"` | Required NIH language - preserve verbatim |
| Yellow highlight | `highlight: "yellow"` | Label for template users - omit entirely |
| Italic (non-blue) | `italic: true` | Instructions to follow - generate content |
| Bold | `bold: true` | Emphasis - preserve formatting |

The AI determines the block-level ACTION based on overall formatting composition:

### Block Actions

1. **KEEP**: Preserve block content exactly as-is
   - Section headers: "WHY IS THIS STUDY BEING DONE?"
   - Required boilerplate: NIH legal language (all blue)
   - Signature labels: "Date", "Print Name"

2. **DELETE**: Remove block entirely from output
   - NIH template coversheet blocks (indices 0-44 for NIH templates)
   - Conditional sections where condition is FALSE (e.g., child consent for adult cohort)
   - Meta-guidance about writing style ("Be concise", "Use bullet points")

3. **REPLACE**: Generate new content for block
   - Content-generating instructions with placeholders
   - Mixed formatting blocks (preserve blue, omit yellow, generate for italic)
   - Label-only blocks that need actual values (e.g., "PRINCIPAL INVESTIGATOR:  ")

4. **INSERT**: Add new content after specified block (original block unchanged)
   - Drug side effects tables (after general risk intro)
   - Additional procedure descriptions
   - Supplementary risk information

## Processing Pipeline

### 1. Template Extraction

```javascript
const { blocks } = await docxExtractTextBlocks(templateBuffer, { includeFormatting: true });
```

Extracts blocks with:
- `index`: Block position in document (0-based)
- `text`: Plain text content
- `style`: Word style (Heading1, Normal, etc.) - for paragraphs
- `runs`: Array of text segments with formatting (color, highlight, italic, bold)
- `type`: "paragraph" | "cell"
- `source`: "body" | "header" | "footer"
- `row`, `col`: Table position - for cells only

### 2. Section Map Computation

```javascript
const sectionMap = computeSectionMap(blocks);
for (const block of blocks) {
  block.section = sectionMap[block.index];
}
```

Scans all blocks to identify section headings and assigns each block its section context. This is computed GLOBALLY before chunking to ensure accurate context across chunk boundaries.

### 3. Chunking Strategy

**Protocol Chunking:**
```javascript
const PROTOCOL_CHUNK_SIZE = 20000; // ~20KB per chunk
const PROTOCOL_OVERLAP = 2000;      // 2KB overlap
const protocolChunks = chunkProtocol(protocolText, PROTOCOL_CHUNK_SIZE, PROTOCOL_OVERLAP);
```

**Template Chunking:**
```javascript
const TEMPLATE_CHUNK_SIZE = 40;     // 40 blocks per chunk
const TEMPLATE_OVERLAP = 10;        // 10 block overlap
const templateChunks = chunkTemplateBlocks(blocks, TEMPLATE_CHUNK_SIZE, TEMPLATE_OVERLAP);
```

Overlap ensures information at chunk boundaries isn't lost and section context is preserved.

### 4. Two-Phase Processing

**Phase 1 - Priming:**
Process first template chunk with each protocol chunk to warm the cache:
```javascript
const primingResults = await runWithConcurrency(
  protocolChunks.map(pChunk => () =>
    processChunkPair(pChunk, templateChunks[0], libraryText, totalChunks, model, runModelFn)
  ),
  MAX_CONCURRENT_REQUESTS
);
```

**Phase 2 - Main Processing:**
Process all remaining protocol × template combinations in parallel:
```javascript
for (const pChunk of protocolChunks) {
  for (const tChunk of templateChunks.slice(1)) {
    remainingTasks.push(() => processChunkPair(pChunk, tChunk, ...));
  }
}
const remainingResults = await runWithConcurrency(remainingTasks, MAX_CONCURRENT_REQUESTS);
```

### 5. Chunk Pair Processing

Each chunk pair is processed with retry logic:
```javascript
async function processChunkPair(protocolChunk, templateChunk, libraryText, totalChunks, model, runModelFn, maxRetries = 2) {
  const systemPrompt = buildBlockSystemPrompt(protocolChunk, libraryText, totalChunks);
  const messages = [{ role: "user", content: [{ text: buildBlockUserPrompt(templateChunk) }] }];

  // Retry with conversation context if JSON parsing fails
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await runModelFn({ model, messages, system: systemPrompt, thoughtBudget: 10000 });
    const parsed = parseJsonResponse(response);
    if (parsed.success) return { candidates: parsed.data };
    // Add assistant response and retry prompt to messages for self-correction
  }
}
```

### 6. Confidence-Based Merging

```javascript
function mergeByConfidence(allResults, blocks) {
  const byIndex = new Map();
  const insertsByIndex = new Map();

  for (const result of allResults) {
    for (const candidate of result.candidates) {
      // INSERT actions tracked separately
      // REPLACE/DELETE with content beats KEEP
      // Higher confidence wins when actions match
      // Same-confidence INSERTs with different content are combined
    }
  }

  return { replacements, candidateMap };
}
```

Merging rules:
- REPLACE/DELETE with content always beats KEEP
- Higher confidence wins when actions are the same
- INSERT actions are tracked separately and can be combined
- Low-confidence KEEP (< 5) is skipped
- APPEND actions (adds content to existing block) are handled but rarely used

### 7. Document Generation

```javascript
const outputBuffer = await docxReplace(templateBuffer, replacements);
```

Applies the merged replacement map to generate the final document.

## System Prompt Architecture

The system prompt (~520 lines in `buildBlockSystemPrompt()`) provides comprehensive instructions:

### Protocol Context
```
## PROTOCOL EXCERPT (chunk X of Y)
<protocol_excerpt>
${protocolChunk.text}
</protocol_excerpt>
```

### Consent Library
```
## CONSENT LIBRARY (standardized IRB-approved language)
<consent_library>
${libraryText}
</consent_library>
```

### Cohort Type
The prompt includes `## COHORT TYPE: ${cohortType}` to indicate the target audience (e.g., "adult-patient"). Currently defaults to "adult-patient" - cohort-specific generation is planned but not yet implemented.

### Formatting Guide
Detailed table mapping formatting to actions with examples.

### Action Definitions
Comprehensive rules for KEEP, DELETE, REPLACE, INSERT with examples.

### Section Ordering Rules
Critical rules ensuring content is placed in correct sections.

### Drug Side Effects Format
Standardized NIH format for presenting medication risks.

### Output Format
```json
{
  "index": <block number>,
  "action": "REPLACE" | "DELETE" | "KEEP" | "INSERT",
  "content": "<generated text>" | null,
  "confidence": 1-10,
  "reasoning": "<explanation>",
  "exact_quote": "<protocol text used>",
  "procedure_library": "<library section used>" | null
}
```

### Confidence Scoring
- 10: Exact data found, clear instruction
- 7-9: Relevant data found, clear instruction
- 4-6: Partial data or ambiguous instruction
- 1-3: No relevant data in this excerpt (use KEEP)

## AI Integration

### Endpoint
```javascript
const response = await fetch("/api/model", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model,
    messages,
    system: systemPrompt,
    thoughtBudget: 10000,
    stream: false
  })
});
```

### Response Parsing
Handles markdown code blocks (`\`\`\`json`) and validates JSON structure.

### Retry Logic
Failed JSON parsing triggers retry with conversation context for self-correction.

## Concurrency & Performance

### Concurrent Request Limit
```javascript
const MAX_CONCURRENT_REQUESTS = 20;
```

### Concurrency Control
```javascript
async function runWithConcurrency(tasks, maxConcurrent) {
  const results = [];
  const executing = new Set();

  for (const task of tasks) {
    const promise = task().then((result) => {
      executing.delete(promise);
      return result;
    });
    executing.add(promise);
    results.push(promise);

    if (executing.size >= maxConcurrent) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
}
```

### Pre-fetching Strategy
Templates and consent libraries are fetched when user selects them, not at submit time:
```javascript
createEffect(async () => {
  for (const templateId of [...store.selectedTemplates, store.selectedPredefinedTemplate]) {
    await fetchAndCacheTemplate(templateId);
    await fetchAndCacheLibrary(templateId);
  }
});
```

## Template Configuration

### Structure (config.js)
```javascript
export const templateConfigs = {
  "nih-cc-adult-patient": {
    label: "Adult affected patient",
    prefix: "NIH CCC",
    category: "NIH Clinical Center Consent (NIH CCC)",
    templateUrl: "/templates/nih-cc/...",
    libraryUrl: "/templates/nih-cc/consent-library.txt",
    filename: "nih-cc-consent-adult-affected.docx",
    disabled: false,
  },
  // ... more templates
};
```

### Available Templates

| ID | Category | Description |
|----|----------|-------------|
| `nih-cc-adult-patient` | NIH CCC | Adult affected patient consent |
| `nih-cc-adult-healthy` | NIH CCC | Adult healthy volunteer consent |
| `nih-cc-adult-family` | NIH CCC | Adult family member consent |
| `nih-cc-child-assent` | NIH CCA | Child/cognitive impairment assent (disabled) |
| `lpa-adult-patient` | LPA | Lay person abstract - patient |
| `lpa-adult-healthy` | LPA | Lay person abstract - healthy |
| `lpa-adult-family` | LPA | Lay person abstract - family |

### Category Grouping
```javascript
export function getTemplateConfigsByCategory() {
  // Returns: [{ label: "Category", options: [{ value: "id", disabled: false }] }]
}
```

## Session Persistence

### Database Schema
```javascript
async function getDatabase(userEmail = "anonymous") {
  const userName = userEmail.toLowerCase().replace(/[^a-z0-9]/g, "-")...;
  return await openDB(`arti-consent-crafter-${userName}`, 1, {
    upgrade(db) {
      const store = db.createObjectStore("sessions", {
        keyPath: "id",
        autoIncrement: true
      });
      store.createIndex("createdAt", "createdAt");
    }
  });
}
```

### Session Operations
- **Create**: `const id = await db.add("sessions", session);`
- **Save**: `await db.put("sessions", session);`
- **Load**: `const session = await db.get("sessions", +id);`

### URL Integration
Session ID stored in URL param `?id=X` for bookmarking and sharing.

### Auto-Retry
Interrupted jobs (status: "processing") are automatically retried on page load:
```javascript
const interruptedJobs = Object.entries(store.generatedDocuments)
  .filter(([_id, job]) => job.status === "processing");
for (const [jobId] of interruptedJobs) {
  retryJob(jobId);
}
```

## Validation Rules

### Submit Button Enabled When
```javascript
const submitDisabled = createMemo(() => {
  if (!store.inputFile) return true;

  const hasBasicTemplates = store.selectedTemplates.length > 0;
  const hasValidAdvancedOptions = store.advancedOptionsOpen && (
    (store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) ||
    (store.templateSourceType === "custom" && store.customTemplateFile)
  );

  return !(hasBasicTemplates || hasValidAdvancedOptions);
});
```

## Error Handling

- JSON parsing failures trigger retry with conversation context
- Job errors are captured and displayed with retry option
- Session persistence allows recovery from browser refresh
- Progress tracking shows detailed status during processing

## Statistics Tracking

Each completed job includes:
```javascript
stats: {
  protocolChunks: number,     // Number of protocol chunks
  templateChunks: number,     // Number of template chunks
  totalCombinations: number,  // protocolChunks × templateChunks
  totalBlocks: number,        // Total blocks in template
  deleteCount: number,        // Blocks deleted
  replaceCount: number,       // Blocks replaced (includes insertions)
  avgConfidence: string,      // Average confidence score
}
```

## UI Components

```
Page()
├── AlertContainer
├── Form
│   ├── FileInput (source document)
│   ├── Template Selection (checkbox list by category)
│   ├── Advanced Options (collapsible)
│   │   ├── Model Select
│   │   ├── Template Source Toggle
│   │   ├── Predefined/Custom Template Selection
│   │   └── Custom Library URL
│   └── Action Buttons (Generate/Reset)
└── Results Panel
    ├── Progress Message & Bar
    ├── Job Status List
    │   └── Job Card (prefix, label, filename, stats, download/retry)
    ├── Download All Button
    └── Feedback Link
```

## Dependencies

- **SolidJS**: Reactive UI framework
- **idb**: IndexedDB wrapper for session storage
- **docxExtractTextBlocks**: Custom DOCX block extraction with formatting
- **docxReplace**: Custom DOCX replacement utility
- **parseDocument**: Protocol text extraction (PDF/DOCX/TXT)
