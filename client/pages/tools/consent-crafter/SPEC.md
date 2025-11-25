# Consent-Crafter Application Specification

## Overview

Consent-Crafter transforms unstructured documents into standardized forms using AI extraction and DOCX templates. The application uses a job-based architecture where each output document is generated independently.

## Architecture Principles

1. **File-First Storage**: Store File blobs directly in IndexedDB, no text extraction caching
2. **Job-Based Processing**: Each output document is a separate job with its own input file, template, and prompt
3. **Minimal State**: Store only essential data - input files, template selections, and job results
4. **Self-Contained Jobs**: Each job re-parses input files independently (fast operation)

## Store Structure

```javascript
const [store, setStore] = createStore({
  // Session
  id: null,

  // Input - array of File blobs
  inputFiles: [],

  // Basic Template Selection - array of template IDs from config.js
  selectedTemplates: [],

  // Advanced Options
  model: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
  advancedOptionsOpen: false,
  
  // Advanced Template Source
  templateSourceType: "predefined", // "predefined" | "custom"
  selectedPredefinedTemplate: "", // template ID from config.js
  customTemplateFiles: [], // array of File blobs for custom templates
  customSystemPrompt: "", // custom prompt text

  // Job Results - keyed by jobId
  generatedDocuments: {}, // { jobId: { status, blob, content, error } }

  // UI State
  expandModalOpen: false,
});
```

## Data Flow

### 1. Input Selection
- User uploads files via FileInput component
- Files stored directly as File blobs in `store.inputFiles`
- No text extraction at this stage

### 2. Template Selection

#### Basic Mode:
- User selects one or more predefined templates
- Template IDs stored in `store.selectedTemplates`
- Uses default prompts from config.js

#### Advanced Mode:
- User can select either:
  - **Predefined template** + custom prompt
  - **Custom template file** + custom prompt
- Advanced selection is additive to basic selections

### 3. Job Generation
When user clicks Generate, create jobs for:
- Each selected basic template (with default prompt)
- Advanced predefined template (with custom prompt) if selected
- Custom template (with custom prompt) if uploaded

### 4. Job Processing
Each job is independent and contains:
```javascript
{
  jobId: string, // unique identifier
  inputFile: File, // the source document blob
  templateSource: { type: "url" | "blob", value: string | File },
  prompt: string, // extraction instructions
  model: string, // AI model ID
  defaultOutputData: object // from config.js
}
```

## Job Processing Pipeline

For each job:

1. **Parse Input**: Extract text from `inputFile` using `parseDocument()`
2. **Get Template**: 
   - If URL: fetch template file
   - If blob: use directly
3. **AI Extraction**: Send text + prompt to AI model, get JSON response
4. **Document Generation**: Fill template with extracted data using docx-templates
5. **Store Result**: Save blob and status to `store.generatedDocuments[jobId]`

## Components

### Main Component Structure
```
Page()
├── FileInput (for source documents)
├── TemplateSelection (inline, not separate component)
│   └── Checkbox list grouped by category
├── AdvancedOptions (collapsible)
│   ├── ModelSelect
│   ├── TemplateSourceToggle (predefined/custom)
│   ├── PredefinedTemplateSelect (if predefined)
│   ├── FileInput (if custom template)
│   └── CustomPromptTextarea
├── ResultsPanel
│   └── JobStatusList
└── ActionButtons (Generate/Reset)
```

### Job Status Display
Each job shows:
- Template name and description
- Status: processing | completed | error
- Download button (if completed)
- Retry button (if error)

## Validation Rules

Generate button enabled when:
```javascript
const canGenerate = 
  store.inputFiles.length > 0 && (
    // Basic templates selected
    store.selectedTemplates.length > 0 ||
    // OR valid advanced options
    (store.advancedOptionsOpen && (
      // Predefined with prompt
      (store.templateSourceType === "predefined" && 
       store.selectedPredefinedTemplate && 
       store.customSystemPrompt.trim()) ||
      // Custom with template and prompt  
      (store.templateSourceType === "custom" && 
       store.customTemplateFiles.length > 0 && 
       store.customSystemPrompt.trim())
    ))
  )
```

## Session Persistence

### Save to IndexedDB
- Store File blobs directly (no base64 conversion)
- Convert generated document blobs to base64 for storage
- Save on: job completion, session creation

### Load from IndexedDB
- Restore File blobs as-is
- Convert base64 back to blobs for generated documents
- Auto-retry interrupted jobs (status: "processing")

## Template Configuration Integration

Use existing config.js structure:
- `templateConfigs` - template metadata and URLs
- `getPrompt(templateId)` - fetch default prompts
- `getTemplateConfigsByCategory()` - grouped templates for UI

## Job ID Generation

Create unique job IDs:
```javascript
function generateJobId(templateId, inputFileName) {
  if (templateId === "custom") return `custom-${Date.now()}`;
  if (templateId === "predefined-custom") return `${store.selectedPredefinedTemplate}-custom-${Date.now()}`;
  return `${templateId}-${Date.now()}`;
}
```

## Error Recovery

- Jobs can be retried individually
- Session persistence allows recovery from browser refresh
- Clear error messaging with specific retry actions

## File Handling

### Supported Input Formats
- PDF, DOCX, TXT files
- Parse using existing `parseDocument()` utility

### Template Files
- DOCX files with `{{placeholder}}` syntax
- Fetch predefined templates from URLs
- Accept uploaded custom templates

### Output Generation
- Use docx-templates library
- Generate timestamped filenames
- Support bulk download

## UI/UX Considerations

### Progressive Enhancement
1. Basic mode: Simple template selection
2. Advanced mode: Power users with custom templates/prompts

### Feedback
- Clear validation messages
- Progress indicators for job processing
- Success/error states for each job

### Accessibility
- Proper form labels and ARIA attributes
- Keyboard navigation support
- Screen reader friendly status updates

## Performance Considerations

- File parsing is fast, safe to re-parse per job
- Parallel job processing for better user experience
- IndexedDB for efficient local storage
- Lazy loading of template configurations

## Security Considerations

- File uploads stay client-side until processing
- No sensitive data in localStorage
- User-isolated IndexedDB storage
- Validate file types and sizes

## Future Enhancements

- Multiple input file processing
- Batch template operations
- Template sharing/import
- Processing history/analytics