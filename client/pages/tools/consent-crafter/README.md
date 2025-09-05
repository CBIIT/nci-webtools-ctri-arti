# ConsentCrafter

## What It Does

Transforms unstructured documents into standardized, purpose-specific documents using AI extraction and templates.

## How It Works

1. Upload source document(s) (PDF/DOCX/TXT)
2. Select output template(s)
3. AI extracts data using template's prompt
4. System fills template with extracted data
5. Download generated document(s)

## Core Concept: Template-Prompt Pairing

Every template needs to be paired with an extraction prompt:

- **Template**: DOCX with {{placeholders}} like {{Study_Title}} or {{Principal_Investigator}}
- **Prompt**: Instructions for AI to extract data for placeholders
- **Process**: Empty template + Prompt → JSON data → Filled template

## Use Case: Consent Forms

- **Source**: Research protocols
- **Templates**: NIH consent forms, lay abstracts
- **Extraction**: Study details, procedures, risks, benefits, contacts
- **Output**: Multiple audience-specific documents. Eg: Completed consent form with all fields filled from the protocol

## Custom Usage

Users can create their own transformations with:

1. [DOCX template](https://www.npmjs.com/package/docx-templates) with {{placeholders}}
2. Matching extraction prompt

## Features

- Documents up to 200 pages
- Batch processing support
- Custom model support
- Role-based access control
- Error recovery mechanisms
