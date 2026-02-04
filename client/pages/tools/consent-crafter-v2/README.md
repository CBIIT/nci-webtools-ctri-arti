# Consent Crafter v2

## What It Does

Generates informed consent documents from research protocols using AI-powered block-based extraction. Upload a protocol document, select consent form templates, and receive completed consent documents with protocol-specific information filled in.

## How It Works

1. **Upload** your protocol document (PDF/DOCX/TXT, up to 200+ pages)
2. **Select** one or more consent form templates
3. **AI processes** the protocol using block-based extraction:
   - Template is parsed into formatted blocks with metadata (blue=required, yellow=delete, italic=instructions)
   - Long documents are chunked with overlapping segments
   - Each protocol chunk × template chunk pair is processed in parallel
   - Results are merged by confidence score (highest confidence wins per block)
4. **Download** the generated consent document(s)

## Core Concept: Block-Based Extraction

Unlike simple placeholder filling, this tool uses formatting-aware block processing. Template formatting indicates how to handle each text segment:

| Template Formatting | Meaning |
|---------------------|---------|
| Blue text (`0070C0`, `2E74B5`) | Required NIH language - preserve verbatim in output |
| Yellow highlight | Label for template users - omit from output entirely |
| Italic text (non-blue) | Instructions to follow - generate replacement content |
| Bold text | Emphasis - preserve formatting |

The AI assigns each block one of four actions based on overall formatting:

- **KEEP**: Block is complete as-is (section headers, required boilerplate, signature labels)
- **DELETE**: Remove block entirely (conditional sections for other cohorts, meta-guidance, coversheet instructions)
- **REPLACE**: Generate new content (instruction blocks, mixed formatting, label-only blocks needing values)
- **INSERT**: Add substantial new content after block (drug side effects tables, additional procedures)

## Use Cases

### NIH Clinical Center Consent Forms
- Adult affected patient consent
- Adult healthy volunteer consent
- Adult family member consent
- Child/cognitive impairment assent (coming soon)

### Lay Person Abstracts
- Patient-friendly study summaries
- Multiple cohort types supported

## Key Features

- **Long document support**: Handles protocols 100+ pages via overlapping chunk strategy
- **Parallel processing**: Up to 20 concurrent API calls for faster generation
- **Confidence-based merging**: Duplicate results resolved by selecting highest confidence
- **Consent library integration**: IRB-approved language for common procedures/risks
- **Session recovery**: Resume interrupted work, retry failed jobs
- **Section-aware extraction**: Content placed in correct document sections
- **Custom templates**: Advanced users can use custom templates with optional consent libraries

## Technical Details

- **Chunking**: Protocol (20KB chunks, 2KB overlap) × Template (40 blocks, 10 block overlap)
- **Processing**: Two-phase approach (priming + parallel main)
- **Merging**: Per-block confidence scoring (1-10 scale)
- **Output**: DOCX with formatting preserved via `docxReplace()` utility
