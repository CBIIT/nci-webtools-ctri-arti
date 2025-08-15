# ConsentCrafter

## What It Does
Transforms unstructured documents into standardized, purpose-specific documents using AI extraction and templates.

## How It Works
1. Upload source document(s) (PDF/DOCX/TXT)
2. Select output template(s) 
3. AI extracts data using template's prompt
4. System fills template with extracted data
5. Download generated document(s)

## Core Concept
**Every template has a paired extraction prompt.**
- Template: DOCX with {{placeholders}}
- Prompt: Instructions for AI to extract data matching placeholders
- Output: JSON data -> filled template

## Technical Architecture
- **Input**: Parse uploaded documents
- **Extraction**: Send doc + prompt to AI -> get JSON
- **Generation**: Apply JSON to template -> create DOCX
- **Validation**: Check extracted data matches schema

## Custom Usage
Users provide:
1. [DOCX template](https://www.npmjs.com/package/docx-templates) with {{placeholders}}
2. Extraction prompt that produces matching JSON

## Example: Consent Forms
 - **Source**: Research protocol
 - **Templates**: NIH consent forms, lay abstracts
 - **Extraction**: Study details, procedures, risks, benefits, contacts
 - **Output**: Multiple audience-specific documents

## Requirements
- Documents up to 200 pages
- Batch processing support
- Custom model supportW
- Role-based access control
- Error recovery mechanisms
