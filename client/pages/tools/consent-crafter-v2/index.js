/**
 * Consent Crafter v2 - Block-based consent form generation
 *
 * PURPOSE: Clinical research requires informed consent documents that explain study procedures,
 * risks, and benefits to participants. Creating these documents is time-consuming because
 * researchers must manually extract information from lengthy protocol documents and translate
 * it into patient-friendly language using standardized NIH templates.
 *
 * This tool automates that process: upload a protocol, select consent templates, and receive
 * completed consent documents with protocol-specific information filled in.
 *
 * HOW IT WORKS:
 * 1. Protocol is chunked into overlapping segments (handles long documents)
 * 2. Template blocks are extracted with formatting metadata (blue=required, italic=instructions)
 * 3. Each protocol chunk × template chunk pair is processed by AI in parallel
 * 4. Results are merged by confidence score (highest confidence wins per block)
 * 5. Final document is generated with replacements applied
 *
 * This file is organized with #region/#endregion markers for code folding.
 * To list all regions: grep -n "^// #region" index.js
 */

// #region Imports
import { createEffect, createMemo, createResource, For, Show } from "solid-js";
import html from "solid-js/html";

import { openDB } from "idb";
import { createStore, reconcile, unwrap } from "solid-js/store";

import { AlertContainer } from "../../../components/alert.js";
import FileInput from "../../../components/file-input.js";
import Tooltip from "../../../components/tooltip.js";
import { MODEL_OPTIONS } from "../../../models/model-options.js";
import { alerts, clearAlert } from "../../../utils/alerts.js";
import { docxExtractTextBlocks, docxReplace } from "../../../utils/docx.js";
import { createTimestamp, downloadBlob } from "../../../utils/files.js";
import { parseDocument } from "../../../utils/parsers.js";

import { getTemplateConfigsByCategory, templateConfigs } from "./config.js";
// #endregion

// #region Constants
// Tuning parameters for chunking strategy. Protocol chunks overlap to avoid losing context
// at boundaries. Template chunks are sized to fit within model context limits.
const PROTOCOL_CHUNK_SIZE = 20000; // ~20KB per protocol chunk
const PROTOCOL_OVERLAP = 2000; // 2KB overlap
const TEMPLATE_CHUNK_SIZE = 40; // 40 blocks per template chunk
const MAX_CONCURRENT_REQUESTS = 20; // Limit parallel API calls
// #endregion

// #region Database
// Sessions are stored in IndexedDB, scoped by user email. This allows users to resume
// interrupted work and retry failed jobs without re-uploading documents.
async function getDatabase(userEmail = "anonymous") {
  const userName = userEmail
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
  const dbName = `arti-consent-crafter-${userName}`;
  return await openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore("sessions", {
        keyPath: "id",
        autoIncrement: true,
      });
      store.createIndex("createdAt", "createdAt");
    },
  });
}
// #endregion

// #region Chunking
// Protocols can be 100+ pages. Templates can have 200+ blocks. Processing everything at once
// would exceed model context limits. Instead, we chunk both and process all combinations,
// then merge results. Overlap ensures information at chunk boundaries isn't lost.

/**
 * Chunk the protocol text into overlapping segments
 * @param {string} text - Full protocol text
 * @param {number} chunkSize - Size of each chunk in characters
 * @param {number} overlap - Overlap between chunks in characters
 * @returns {Array<{index: number, text: string, startChar: number, endChar: number}>}
 */
function chunkProtocol(text, chunkSize = PROTOCOL_CHUNK_SIZE, overlap = PROTOCOL_OVERLAP) {
  const chunks = [];
  const step = chunkSize - overlap;
  for (let i = 0; i < text.length; i += step) {
    const endChar = Math.min(i + chunkSize, text.length);
    chunks.push({
      index: chunks.length,
      text: text.slice(i, endChar),
      startChar: i,
      endChar,
    });
    if (endChar >= text.length) break;
  }
  return chunks;
}

/**
 * Chunk template blocks while preserving original indices
 * @param {Array} blocks - All template blocks with their original indices
 * @param {number} chunkSize - Number of blocks per chunk
 * @returns {Array<{index: number, blocks: Array}>}
 */
function chunkTemplateBlocks(blocks, chunkSize = TEMPLATE_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < blocks.length; i += chunkSize) {
    chunks.push({
      index: chunks.length,
      blocks: blocks.slice(i, i + chunkSize),
    });
  }
  return chunks;
}
// #endregion

// #region Prompts
// The AI needs detailed instructions to correctly interpret template formatting conventions.
// Blue text = NIH-required language (keep verbatim), yellow = labels to remove, italic = instructions
// to follow. The consent library provides IRB-approved language for common procedures/risks.

/**
 * Build the system prompt for block-based consent generation.
 * Contains formatting guide, action definitions (KEEP/REPLACE/DELETE/INSERT), and examples.
 */
export function buildBlockSystemPrompt(protocolChunk, libraryText, totalChunks, cohortType = "adult-patient") {
  return `You are a consent form generator. Your job is to FOLLOW the instructions in each template block to generate patient-friendly consent language.

## PROTOCOL EXCERPT (chunk ${protocolChunk.index + 1} of ${totalChunks})
<protocol_excerpt>
${protocolChunk.text}
</protocol_excerpt>

## CONSENT LIBRARY (standardized IRB-approved language)
<consent_library>
${libraryText}
</consent_library>

## COHORT TYPE: ${cohortType}

## FORMATTING GUIDE - Template Color Scheme

The template uses formatting to indicate what action to take. Each block includes "runs" array showing text segments with their formatting:

| Formatting | Meaning | Action |
|------------|---------|--------|
| \`color: "0070C0"\` or \`color: "2E74B5"\` (blue) | Required NIH language | **KEEP exactly as-is** |
| \`highlight: "yellow"\` | Placeholder label | **DELETE** this label text |
| \`italic: true\` (no blue color) | Instructions to follow | **FOLLOW and REPLACE** with generated content |
| No special formatting | Standard consent text | **KEEP or REPLACE** as appropriate |

## CRITICAL: Mixed-Formatting Blocks Require REPLACE Action

**IMPORTANT**: When a block has MIXED formatting (some blue, some yellow, some italic), you MUST use action "REPLACE" and compose the replacement content by:

1. **COPY** blue text (color: 0070C0 or 2E74B5) verbatim into your output
2. **OMIT** yellow-highlighted text entirely (do NOT include it)
3. **GENERATE** content to replace italic instructions based on the protocol

### Example - Block 53 (KEY INFORMATION) with Mixed Formatting:

**Input runs:**
\`\`\`
[0] {highlight:yellow, italic} "[Required NIH language...]:" → OMIT (yellow label)
[1] {color:0070C0} "This consent form describes a research study..." → COPY VERBATIM
[2] {color:0070C0} "You are being asked to take part..." → COPY VERBATIM
[3] {italic} "This Key Information section is meant to provide..." → GENERATE REPLACEMENT (substantial content!)
\`\`\`

**Correct output for this block:**
\`\`\`json
{
  "index": 53,
  "action": "REPLACE",
  "content": "This consent form describes a research study and is designed to help you decide if you would like to be a part of the research study.\\n\\nYou are being asked to take part in a research study at the National Institutes of Health (NIH). This section provides the information we believe is most helpful and important to you in making your decision about participating in this study. Additional information that may help you decide can be found in other sections of the document. Taking part in research at NIH is your choice.\\n\\nYou are being asked to take part in this study because you have cancer that has spread locally or to other organs, and your cancer doctor recommended treatment with atezolizumab alone or in combination with other FDA-approved drug(s).\\n\\nAtezolizumab may stop the growth of cancer cells by blocking the work of some of the proteins needed for cell growth and by helping your immune system to fight cancer.\\n\\nAtezolizumab is approved by the U.S. Food and Drug Administration (FDA) to treat some types of cancers. The use of atezolizumab in this study is considered investigational because we are using therapeutic drug monitoring to adjust dosing.\\n\\nThe purpose of this study is to look at the best dose and frequency of atezolizumab to give based on drug levels in your blood.\\n\\nIf you decide to join this study, here are some of the most important things that you should know:\\n\\n• First, we will perform tests to see if you fit the study requirements.\\n• If you fit the study requirements, you will start treatment with atezolizumab.\\n• Starting from the 3rd dose, your dose will be adjusted based on blood levels.\\n• Study treatment will last for 2 years.\\n• This study may benefit you by shrinking your tumor.\\n\\nYou are free to stop taking part at any time.",
  "confidence": 9,
  "reasoning": "Mixed formatting block: copied blue required text verbatim, omitted yellow label, replaced italic instructions with substantial study-specific key information from protocol"
}
\`\`\`

**WRONG outputs (DO NOT DO THESE):**

1. **Only keeping blue text without generating content:**
\`\`\`json
{
  "index": 53,
  "action": "REPLACE",
  "content": "This consent form describes... [ONLY BLUE TEXT, NO STUDY-SPECIFIC INFO]"
}
\`\`\`
This is WRONG because the italic instructions say to generate key information but you didn't.

2. **Using KEEP:**
\`\`\`json
{
  "index": 53,
  "action": "KEEP"
}
\`\`\`
This is WRONG because it keeps yellow labels and italic instructions.

**KEY POINT**: When italic instructions say to generate content (like "This Key Information section is meant to provide prospective participants with information..."), you MUST generate substantial study-specific content from the protocol, not just delete the instructions.

## CRITICAL UNDERSTANDING

The template contains INSTRUCTIONS that tell you what content to generate. Your job is to:
1. READ the formatting to understand what's required vs. what's instructions
2. For blocks with ONLY blue text that is COMPLETE content → use KEEP
3. For blocks with ONLY blue text that is a LABEL needing content (e.g., "PRINCIPAL INVESTIGATOR:  ", "STUDY TITLE:") → use REPLACE to add the actual content after the label
4. For blocks with ONLY italic instructions → use REPLACE with generated content OR DELETE if redundant
5. For blocks with MIXED formatting → use REPLACE, composing output that preserves blue and generates new content for italic
6. For blocks with yellow highlights → ALWAYS omit the yellow text from output

**Blue text is MANDATORY** - Always preserve it exactly as-is in your output.
**Yellow labels are for template users** - NEVER include them in output.
**Italic instructions tell you what to generate** - Replace with actual content from protocol.

## SPECIAL CASES

### 1. Label-only blocks (PRINCIPAL INVESTIGATOR, STUDY TITLE, STUDY SITE)
These blocks contain ONLY a blue label like "PRINCIPAL INVESTIGATOR:  " with nothing after it.
- Action: REPLACE
- Content: "PRINCIPAL INVESTIGATOR: [actual PI name from protocol]"
- Example: "PRINCIPAL INVESTIGATOR: James Gulley, MD, PhD"

### 2. Instruction blocks before headings
If an italic instruction block appears immediately before a heading with similar topic:
- The instruction block should be DELETED (action: DELETE, or content: null)
- The heading block should be KEPT
- Do NOT replace the instruction with the heading text (causes duplication)

### 3. Bracketed placeholders
NEVER include bracketed placeholders like [X], [insert something], or [coordinating center] in your output.
- If you can find the actual info in the protocol, use it
- If you cannot find the info, omit that sentence entirely
- Your output should be FINAL text ready for a patient to read

## THE FOUR ACTIONS

### INSERT - Use when SUBSTANTIAL content needs to be ADDED after a block:

Use INSERT when you need to add substantial new content that doesn't fit in any existing block. The new content is inserted as a NEW paragraph AFTER the specified block. The original block remains unchanged.

**Key use cases for INSERT:**
1. **Drug side effects tables** - When protocol has detailed toxicity data that needs the standardized NIH format (see DRUG SIDE EFFECTS section below)
2. **Additional procedure descriptions** - When a procedure list needs expansion beyond what fits in one block
3. **Supplementary risk information** - When risks span multiple categories needing separate formatting

**When to use INSERT vs REPLACE:**
- Use REPLACE when you're transforming/filling in an existing block's content
- Use INSERT when you have NEW content to ADD that doesn't replace anything

**Pattern recognition for INSERT:**
- Template has a general intro block (e.g., "Taking any medication can cause side effects...")
- Protocol has detailed data that should follow that intro (e.g., drug toxicity tables)
- The detailed data is too substantial to merge into the intro block
- → REPLACE the intro block with updated intro, then INSERT the detailed content after it

### DELETE - Use for:
1. **Coversheet blocks (indices 0-44)** - Template usage instructions, not consent content

2. **Conditional sections where condition is FALSE** - e.g., for adult patient cohort:
   - "[Use this language if seeking parental permission for a child]" → DELETE (not applicable)
   - "Legally Authorized Representative" signature block → DELETE (not applicable)
   - "Parent/Guardian of a Minor" signature block → DELETE (not applicable)

3. **General meta-guidance about writing style** - Instructions that tell you HOW to write but don't specify WHAT content to generate:
   - "Be concise; use short sentences and short paragraphs. Bullet points are okay." → DELETE
   - "12-point, Times New Roman is the preferred font." → DELETE
   - "Proofread, and spell check the final clean document." → DELETE
   - "Use the Consent Library for suggested procedure descriptions." → DELETE (unless followed by specific content instruction)
   - "If there is randomization, explain this clearly." → DELETE (general reminder, not tied to specific content block)
   - "Note: This information should be described here only if more information is needed..." → DELETE

### REPLACE - Use for CONTENT-GENERATING instructions:

These are instructions that specify WHAT content should appear in the final document. They have a "slot" that needs to be filled.

**Pattern: Template sentence with placeholder instruction:**
- "The purpose of this research study is [general description of the project]"
  → Write the actual purpose using protocol information

- "We are asking you to join because you [complete this sentence describing eligibility]"
  → Complete the sentence with eligibility criteria from protocol

- "[Name of drug/device] is considered investigational..."
  → Fill in the drug name and explain why it's investigational

- "We plan to have approximately [accrual ceiling #] people"
  → Fill in the actual number from the protocol

- "If you decide to take part in this study, you will be asked to [Include the following...]"
  → Generate the actual procedure list based on protocol

**Pattern: Explicit content generation instruction:**
- "Refer to the 'consent library' for the appropriate language" (in a SPECIFIC section like Pregnancy Risks)
  → Look up that section in library, use standardized language with protocol values

- "Include the approximate number of subjects to be included in the study"
  → Generate: "We plan to have approximately 40 people participate..."

- "For each research procedure, describe the reasonably foreseeable risks"
  → Generate risk descriptions using consent library + protocol data

**Pattern: Bracketed placeholder in otherwise-final text:**
- "[PI name]" → Replace with actual PI name
- "[drug name]" → Replace with actual drug name
- "[accrual ceiling #]" → Replace with actual number
- Keep surrounding text, only replace the bracketed portion

**How to distinguish DELETE vs REPLACE:**
- DELETE: "Be concise" - No specific content slot, just style advice
- REPLACE: "The purpose is [describe purpose]" - Has a content slot to fill
- DELETE: "If there is randomization, explain this clearly" - Reminder without specific slot
- REPLACE: "Describe the randomization process" - Expects actual randomization description

**CRITICAL: Risk/side effect instruction blocks are CONTENT-GENERATING:**

These italic instruction blocks tell you to GENERATE CONTENT, not just provide style guidance:
- "For each research procedure or intervention, describe the reasonably foreseeable risks..." → REPLACE with actual risks from protocol
- "Risk information should be organized by the intervention..." → This tells you HOW to structure the content you're generating
- "Physical risks should be described in terms of magnitude and likelihood..." → This tells you to use COMMON/OCCASIONAL/RARE format
- "If death is a foreseeable outcome..." → REPLACE with the death statement if applicable

When you see a CLUSTER of italic instruction blocks about risks:
1. The FIRST instruction block should be REPLACED with the actual risk content (drug side effects, procedure risks)
2. Subsequent instruction blocks that elaborate on formatting can be DELETED after you've followed their guidance
3. Use INSERT if you need to add substantial formatted content (like drug side effects tables) after an intro paragraph

DO NOT delete all risk instruction blocks without generating content. That leaves the consent with no risk information!

### KEEP - Use for:
- Section headers: "WHY IS THIS STUDY BEING DONE?", "WHAT ARE THE RISKS?"
- Required boilerplate: Long paragraphs of standard NIH legal language
- Signature labels: "Signature of Research Participant", "Date", "Print Name"
- Content you're uncertain about - let another chunk handle it

## PROCEDURE AND RISK DESCRIPTIONS - USE EXACT LIBRARY LANGUAGE

**CRITICAL: The consent library contains IRB-approved language. You MUST use this language VERBATIM - do NOT paraphrase, rephrase, or reword it.**

When generating procedure or risk content:
1. Find the matching section in the consent library
2. Copy the library text EXACTLY as written
3. Only modify [bracketed placeholders] with protocol-specific values
4. Include the library section name in the "procedure_library" field

| Protocol mentions | Find in library | Action |
|-------------------|-----------------|--------|
| blood draw, blood sample | BLOOD DRAWS | Copy EXACT library text, fill [brackets] |
| CT scan, imaging | CT SCAN | Copy EXACT library text, fill [brackets] |
| biopsy, tissue sample | BIOPSY | Copy EXACT library text, fill [brackets] |
| radiation, rem, mSv | RADIATION | Copy EXACT library text, fill [brackets] with protocol values |
| pregnancy test, contraception | PREGNANCY | Copy EXACT library text, fill [brackets] |
| allergic reaction | ALLERGIC REACTION | Copy EXACT library text |
| infusion reaction | INFUSION REACTION | Copy EXACT library text |

**WRONG (paraphrasing):**
Library: "Blood draws may cause pain, redness, bruising, or infection where we put the needle."
Output: "Blood draws may cause pain, redness, bruising, or infection at the needle site." ❌

**CORRECT (verbatim):**
Library: "Blood draws may cause pain, redness, bruising, or infection where we put the needle."
Output: "Blood draws may cause pain, redness, bruising, or infection where we put the needle." ✓

## DRUG SIDE EFFECTS - REQUIRED FORMAT

When the protocol contains drug toxicity/adverse event information, you MUST present it using this standardized NIH format. This applies to ANY drug (chemotherapy, immunotherapy, targeted therapy, etc.).

### Where to Find Drug Side Effects in Protocols

Drug toxicity information is typically found in:
- Pharmaceutical/Drug Information sections (often Section 14.x)
- Sections titled "Toxicity", "Adverse Events", "Side Effects", "Safety"
- Look for frequency breakdowns: ">20%", "4-20%", "<3%", "more than 20 out of 100", etc.

### Required Output Format

**CRITICAL: Use this EXACT format structure. The phrasing "In 100 people receiving [drug]..." is standardized NIH language.**

\`\`\`
Possible Side Effects of [Drug Name]

COMMON, SOME MAY BE SERIOUS
In 100 people receiving [drug name], more than 20 and up to 100 may have:
• [side effect where frequency >20%]
• [side effect where frequency >20%]

OCCASIONAL, SOME MAY BE SERIOUS
In 100 people receiving [drug name], from 4 to 20 may have:
• [side effect where frequency 4-20%]
• [side effect where frequency 4-20%]

RARE, AND SERIOUS
In 100 people receiving [drug name], 3 or fewer may have:
• [side effect where frequency <3%]
• [side effect where frequency <3%]
\`\`\`

### How to Apply This

1. **Find the drug toxicity section** in the protocol (search for "toxicity", "adverse", or percentage breakdowns)
2. **Extract side effects by frequency category** from the protocol data
3. **Convert clinical terminology to patient-friendly language:**
   - "fatigue" → "tiredness"
   - "pyrexia" → "fever"
   - "dyspnea" → "shortness of breath"
   - "anorexia" → "loss of appetite"
   - "pruritus" → "itching"
   - "alopecia" → "hair loss"
4. **Format using the exact structure above** with the drug name from the protocol
5. **Use INSERT action** to add this content after the general risk intro block

### CRITICAL: Risk Instruction Blocks Require Content Generation

When you see template instruction blocks about risks like:
- "For each research procedure or intervention, describe the reasonably foreseeable risks..."
- "Risk information should be organized by the intervention..."
- "Physical risks should be described in terms of magnitude and likelihood..."

These are NOT meta-guidance to delete. They are CONTENT REQUIREMENTS telling you what to generate.

**You MUST search the protocol for drug toxicity data and generate the full side effects table.**

**Step-by-step (ALL steps required when toxicity data exists):**

1. **REPLACE** the first instruction block with BOTH:
   - A brief intro paragraph, AND
   - The FULL drug side effects table (COMMON/OCCASIONAL/RARE format)

2. **DELETE** remaining instruction blocks (they've been fulfilled)

**Your REPLACE content for the first risk instruction block MUST include:**
\`\`\`
Taking any medication can cause side effects. [Brief intro...]

Possible Side Effects of [Drug Name]

COMMON, SOME MAY BE SERIOUS
In 100 people receiving [drug], more than 20 and up to 100 may have:
• [side effect]
• [side effect]

OCCASIONAL, SOME MAY BE SERIOUS
In 100 people receiving [drug], from 4 to 20 may have:
• [side effect]
• [side effect]

RARE, AND SERIOUS
In 100 people receiving [drug], 3 or fewer may have:
• [side effect]
• [side effect]
\`\`\`

**FAILURE MODES TO AVOID:**
❌ WRONG: Only writing a brief intro without the COMMON/OCCASIONAL/RARE table
❌ WRONG: Using KEEP on instruction blocks (leaves instructions in patient document)
❌ WRONG: Using DELETE on all instruction blocks without generating content
✓ RIGHT: REPLACE first instruction with intro + full drug side effects table

## OUTPUT FORMAT

Output a JSON array. Each element:
{
  "index": <block number>,
  "action": "REPLACE" | "DELETE" | "KEEP" | "INSERT",
  "content": "<generated text>" | null,
  "confidence": 1-10,
  "reasoning": "<brief explanation of what instruction you followed>",
  "exact_quote": "<protocol text used>",
  "procedure_library": "<SECTION TITLE\\n<exact verbatim quote from that section>>" | null
}

**Note on INSERT action:**
- INSERT adds a new paragraph AFTER the specified block
- The original block is NOT modified
- Use when substantial content needs to be added (e.g., drug side effects tables)

**IMPORTANT about procedure_library field:**
- Format: "SECTION TITLE\\n<exact verbatim text from that section>"
- Example: "BLOOD DRAWS\\nRisks: Blood draws may cause pain, redness, bruising..."
- The text in "content" should match the library text (with only [brackets] filled in)
- If not using library language, set to null
- This allows verification that library language is being used verbatim

## EXAMPLES

**Example 1 - Following an instruction to describe procedures:**
Input block 65: "If you decide to take part in this study, you will be asked to [Include the following in your description: Describe in plain language, step-by-step what will be done...]"

Output:
{
  "index": 65,
  "action": "REPLACE",
  "content": "If you decide to take part in this study, you will be asked to:\\n\\n• Have blood drawn at each visit to measure the amount of atezolizumab in your blood\\n• Receive atezolizumab infusions, with timing based on your blood test results\\n• Have CT scans every 9 weeks to check your tumor response\\n• Complete questionnaires about your symptoms and quality of life",
  "confidence": 9,
  "reasoning": "Followed instruction to describe procedures step-by-step in plain language",
  "exact_quote": "Blood samples will be collected at baseline and at each subsequent visit... CT scans will be performed every 9 weeks"
}

**Example 2 - Following an instruction with library reference (EXACT library language):**
Input block 97: "Refer to the 'consent library' for the appropriate language that is consistent with your protocol."

Output:
{
  "index": 97,
  "action": "REPLACE",
  "content": "The effects of atezolizumab on a developing pregnancy or breastfeeding infant are unknown. To reduce the risk of harms, women who are pregnant, planning a pregnancy, or breastfeeding cannot be in studies using atezolizumab.\\n\\nIf you could possibly become pregnant (you have not completed menopause or haven't had surgery that makes it impossible for you to become pregnant) and if you have a partner who is able to father children, a blood pregnancy test will be done. The pregnancy test must be negative for you to stay in the study.\\n\\nYou and your partner must agree to one of the following for the entire study, and for 5 months after your last dose of atezolizumab:\\n\\n• Stop having sex (vaginal intercourse), or\\n• Use a highly effective method of contraception (birth control).",
  "confidence": 9,
  "reasoning": "Used EXACT consent library pregnancy language (Unknown risks template), filled in drug name and 5-month duration from protocol",
  "exact_quote": "Contraceptive use should continue for 5 months after the last dose of atezolizumab",
  "procedure_library": "PREGNANCY\\nUnknown risks: The effects of [study drug] on a developing pregnancy or breastfeeding infant are unknown. To reduce the risk of harms, women who are pregnant, planning a pregnancy, or breastfeeding cannot be in studies using [study drug].\\n\\nIf you could possibly become pregnant (you have not completed menopause or haven't had surgery that makes it impossible for you to become pregnant) and if you have a partner who is able to father children, a [blood/urine] pregnancy test will be done. The pregnancy test must be negative for you to stay in the study."
}

**Example 2b - Blood draw risks (EXACT library language):**
Input block contains instruction to describe blood draw risks.

Output:
{
  "index": 92,
  "action": "REPLACE",
  "content": "Risks: Blood draws may cause pain, redness, bruising, or infection where we put the needle. Some people might faint, but this is rare. We can put numbing cream on the area, so the needle won't hurt as much.",
  "confidence": 10,
  "reasoning": "Used EXACT consent library BLOOD DRAWS risk language - copied verbatim",
  "exact_quote": "Blood samples will be collected at each visit",
  "procedure_library": "BLOOD DRAWS\\nRisks: Blood draws may cause pain, redness, bruising, or infection where we put the needle. Some people might faint, but this is rare. We can put numbing cream on the area, so the needle won't hurt as much."
}

**Example 3 - Filling a placeholder:**
Input block 88: "We plan to have approximately [accrual ceiling #] people participate in this study at the NIH."

Output:
{
  "index": 88,
  "action": "REPLACE",
  "content": "We plan to have approximately 40 people participate in this study at the NIH.",
  "confidence": 10,
  "reasoning": "Filled placeholder with accrual number from protocol",
  "exact_quote": "up to 40 participants will be enrolled at the NIH Clinical Center"
}

**Example 4 - Deleting a conditional section (condition FALSE):**
Input block 55: "[Use this language if this consent is seeking parental permission for participation of a child:] If the individual being enrolled is a minor..."

Output:
{
  "index": 55,
  "action": "DELETE",
  "content": null,
  "confidence": 10,
  "reasoning": "Cohort is adult-patient, not minors - condition is FALSE"
}

**Example 5 - Deleting meta-guidance (no content slot):**
Input block 67: "Be concise; use short sentences and short paragraphs. Bullet points are okay."

Output:
{
  "index": 67,
  "action": "DELETE",
  "content": null,
  "confidence": 10,
  "reasoning": "General writing guidance - no specific content to generate"
}

**Example 6 - Deleting standalone reminder:**
Input block 85: "Note: This information should be described here only if more information is needed beyond what has been stated in the Key Information section above."

Output:
{
  "index": 85,
  "action": "DELETE",
  "content": null,
  "confidence": 10,
  "reasoning": "Meta-note for template users, not patient-facing content"
}

**Example 7 - Keeping a section header:**
Input block 90: "WHAT ARE THE RISKS AND DISCOMFORTS OF BEING IN THE STUDY?"

Output:
{
  "index": 90,
  "action": "KEEP",
  "confidence": 10,
  "reasoning": "Section header - keep as-is"
}

## CONFIDENCE SCORING
- 10: Found exact data in protocol, clear instruction to follow
- 7-9: Found relevant data, instruction is clear
- 4-6: Partial data found, or instruction somewhat ambiguous
- 1-3: No relevant data in THIS excerpt - use KEEP (another chunk may have it)

## FINAL REMINDERS

1. **Content-generating instructions → REPLACE** - If the block has a "slot" for content (placeholder, "describe X", "include Y"), FOLLOW the instruction and generate the content
2. **Meta-guidance about style → DELETE** - If the block is just advice on HOW to write (be concise, use bullet points), delete it
3. **Use consent library language** for procedures and risks
4. **Fill in placeholders** with protocol-specific values
5. **KEEP when uncertain** - another chunk may have the data you need
6. **DELETE:** coversheet (0-44), false-condition blocks, and pure style guidance`;
}

/**
 * Build user prompt with template blocks
 */
export function buildBlockUserPrompt(templateChunk) {
  const blocksText = templateChunk.blocks
    .map((b) => {
      const loc =
        b.type === "cell"
          ? `[@${b.index}] ${b.source}/${b.type} (row ${b.row}, col ${b.col})`
          : `[@${b.index}] ${b.source}/${b.type} (${b.style})`;

      // Include formatting info if available
      let formattingInfo = "";
      if (b.runs && b.runs.length > 0) {
        const formattedRuns = b.runs
          .map((r, i) => {
            const fmt = [];
            if (r.color) fmt.push(`color:"${r.color}"`);
            if (r.highlight) fmt.push(`highlight:"${r.highlight}"`);
            if (r.italic) fmt.push("italic");
            if (r.bold) fmt.push("bold");
            const fmtStr = fmt.length ? ` {${fmt.join(", ")}}` : "";
            const preview = r.text.length > 80 ? r.text.slice(0, 80) + "..." : r.text;
            return `  [${i}]${fmtStr} "${preview.replace(/\n/g, "\\n")}"`;
          })
          .join("\n");
        formattingInfo = `\nFormatting runs:\n${formattedRuns}`;
      }

      return `${loc}:${formattingInfo}\n${b.text}`;
    })
    .join("\n\n---\n\n");

  return `## TEMPLATE BLOCKS TO PROCESS

<template_blocks>
${blocksText}
</template_blocks>

Process each block using the formatting guide:
1. Blocks with ONLY blue COMPLETE text (full sentences) → action: KEEP
2. Blocks with ONLY blue LABEL text ending with ":" (e.g., "PRINCIPAL INVESTIGATOR:  ") → action: REPLACE with "label: actual content"
3. Blocks with ONLY italic instructions → action: REPLACE with generated content, OR DELETE if it's redundant with a nearby heading
4. Blocks with MIXED formatting (blue + italic + yellow) → action: REPLACE
   - Your replacement content MUST include the blue text verbatim
   - Your replacement content MUST omit yellow-highlighted text
   - Your replacement content MUST replace italic instructions with generated content
5. Yellow highlight text should NEVER appear in your output
6. Bracketed placeholders like [X] should NEVER appear in your output - find actual info or omit the sentence
7. Do NOT duplicate heading text by replacing instruction blocks with the same heading that follows`;
}
// #endregion

// #region Processing
// The core pipeline: parse JSON responses (handling markdown code blocks), process chunk pairs
// with retry logic, merge candidates by confidence, and orchestrate the full n×m matrix.

/**
 * Parse JSON response, handling markdown code blocks
 */
function parseJsonResponse(response) {
  let jsonStr = response.trim();
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  jsonStr = jsonStr.trim();

  try {
    const data = JSON.parse(jsonStr);
    return { success: true, data, error: null };
  } catch (e) {
    return { success: false, data: [], error: `JSON parse error: ${e.message}` };
  }
}

/**
 * Process a single protocol chunk × template chunk pair with retry.
 * If JSON parsing fails, retries with conversation context for self-correction.
 */
async function processChunkPair(
  protocolChunk,
  templateChunk,
  libraryText,
  totalChunks,
  model,
  runModelFn,
  maxRetries = 2
) {
  const systemPrompt = buildBlockSystemPrompt(protocolChunk, libraryText, totalChunks);
  const messages = [{ role: "user", content: [{ text: buildBlockUserPrompt(templateChunk) }] }];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await runModelFn({
        model,
        messages,
        system: systemPrompt,
        thoughtBudget: 10000,
        stream: false,
      });

      const parsed = parseJsonResponse(response);
      if (parsed.success) {
        return { candidates: Array.isArray(parsed.data) ? parsed.data : [], retries: attempt };
      }

      // JSON retry with conversation history
      if (attempt < maxRetries) {
        messages.push({ role: "assistant", content: [{ text: response }] });
        messages.push({
          role: "user",
          content: [
            {
              text: `Your response had a JSON error: ${parsed.error}\n\nPlease try again. Output ONLY a valid JSON array.`,
            },
          ],
        });
      }
    } catch (error) {
      console.error(`Error processing P${protocolChunk.index}×T${templateChunk.index}:`, error);
      if (attempt === maxRetries) return { candidates: [], error: error.message };
    }
  }
  return { candidates: [], error: "Max retries exceeded" };
}

/**
 * Merge candidates from all n × m results by selecting highest confidence per block.
 * REPLACE/DELETE with content beats KEEP. INSERT actions are tracked separately.
 */
function mergeByConfidence(allResults, blocks = []) {
  const byIndex = new Map();
  const insertsByIndex = new Map();  // Separate map for INSERT actions

  for (const result of allResults) {
    for (const candidate of result.candidates || []) {
      // Handle INSERT actions separately
      if (candidate.action === "INSERT" && candidate.content) {
        const existing = insertsByIndex.get(candidate.index);
        if (!existing) {
          insertsByIndex.set(candidate.index, candidate);
        } else if (candidate.confidence > existing.confidence) {
          // Higher confidence INSERT wins
          insertsByIndex.set(candidate.index, candidate);
        } else if (candidate.confidence === existing.confidence && candidate.content !== existing.content) {
          // Same confidence, different content - check if they're duplicates
          // Extract first line/heading to detect duplicates
          const existingHeading = existing.content.split('\n')[0].trim();
          const candidateHeading = candidate.content.split('\n')[0].trim();

          if (existingHeading === candidateHeading) {
            // Same heading = same content type, take the longer/more complete version
            if (candidate.content.length > existing.content.length) {
              insertsByIndex.set(candidate.index, candidate);
            }
            // Otherwise keep existing (don't duplicate)
          } else {
            // Truly different content - combine them
            const combined = {
              ...existing,
              content: existing.content + "\n\n" + candidate.content,
              confidence: existing.confidence,
            };
            insertsByIndex.set(candidate.index, combined);
          }
        }
        continue;
      }

      const existing = byIndex.get(candidate.index);

      // Skip low-confidence KEEP
      if (candidate.action === "KEEP" && candidate.confidence < 5) continue;

      if (!existing) {
        byIndex.set(candidate.index, candidate);
      } else if ((candidate.action === "REPLACE" || candidate.action === "APPEND") && candidate.content) {
        // REPLACE/APPEND with content wins over KEEP
        if (existing.action === "KEEP" || candidate.confidence > existing.confidence) {
          byIndex.set(candidate.index, candidate);
        }
        // If both are APPEND, combine the content (but avoid duplicates)
        if (existing.action === "APPEND" && candidate.action === "APPEND" && candidate.content) {
          // Check if content is duplicate (same first line/heading)
          const existingHeading = existing.content.split('\n')[0].trim();
          const candidateHeading = candidate.content.split('\n')[0].trim();

          if (existingHeading !== candidateHeading) {
            // Different content, combine
            const combined = {
              ...existing,
              content: existing.content + candidate.content,
              confidence: Math.max(existing.confidence, candidate.confidence),
            };
            byIndex.set(candidate.index, combined);
          } else if (candidate.content.length > existing.content.length) {
            // Same heading, take longer version
            byIndex.set(candidate.index, { ...candidate, action: "APPEND" });
          }
          // Otherwise keep existing, don't duplicate
        }
      } else if (candidate.action === "DELETE" && existing.action === "KEEP") {
        byIndex.set(candidate.index, candidate);
      } else if (candidate.confidence > existing.confidence && candidate.action === existing.action) {
        byIndex.set(candidate.index, candidate);
      }
    }
  }

  // Build replacement map
  const replacements = {};
  for (const [index, candidate] of byIndex) {
    if (candidate.action === "DELETE") {
      replacements[`@${index}`] = null;
    } else if (candidate.action === "REPLACE") {
      replacements[`@${index}`] = candidate.content;
    } else if (candidate.action === "APPEND") {
      // For APPEND, get original block text and add the new content
      const originalBlock = blocks.find((b) => b.index === index);
      const originalText = originalBlock ? originalBlock.text : "";
      replacements[`@${index}`] = originalText + candidate.content;
    }
  }

  // Add INSERT actions to replacements map
  for (const [index, candidate] of insertsByIndex) {
    replacements[`INSERT@${index}`] = candidate.content;
    // Also add to candidateMap for stats tracking
    byIndex.set(`INSERT@${index}`, candidate);
  }

  return { replacements, candidateMap: byIndex };
}

/**
 * Run tasks with limited concurrency to avoid overwhelming the API.
 */
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

/**
 * Main orchestration: extract blocks, chunk protocol/template, process all pairs, merge, apply.
 * Phase 1 primes cache for each protocol chunk. Phase 2 processes remaining combinations.
 */
async function runBlockBasedGeneration(
  templateBuffer,
  protocolText,
  libraryText,
  model,
  runModelFn,
  onProgress
) {
  // 1. Extract template blocks with formatting info
  onProgress?.({ status: "extracting", message: "Extracting template blocks with formatting..." });
  const { blocks } = await docxExtractTextBlocks(templateBuffer, { includeFormatting: true });

  // 2. Chunk protocol and template
  const protocolChunks = chunkProtocol(protocolText);
  const templateChunks = chunkTemplateBlocks(blocks);
  const totalCombinations = protocolChunks.length * templateChunks.length;

  onProgress?.({
    status: "chunked",
    protocolChunks: protocolChunks.length,
    templateChunks: templateChunks.length,
    totalCombinations,
    completed: 0,
    total: totalCombinations,
  });

  // 3. Phase 1: Prime cache for each protocol chunk
  onProgress?.({ status: "priming", completed: 0, total: protocolChunks.length });

  const primingResults = await runWithConcurrency(
    protocolChunks.map(
      (pChunk) => () =>
        processChunkPair(
          pChunk,
          templateChunks[0],
          libraryText,
          protocolChunks.length,
          model,
          runModelFn
        )
    ),
    MAX_CONCURRENT_REQUESTS
  );

  // 4. Phase 2: Process remaining combinations
  const allResults = [...primingResults];

  if (templateChunks.length > 1) {
    const remainingTasks = [];
    for (const pChunk of protocolChunks) {
      for (const tChunk of templateChunks.slice(1)) {
        remainingTasks.push(() =>
          processChunkPair(pChunk, tChunk, libraryText, protocolChunks.length, model, runModelFn)
        );
      }
    }

    let completed = primingResults.length;
    const trackingTasks = remainingTasks.map((task) => async () => {
      const result = await task();
      completed++;
      onProgress?.({ status: "processing", completed, total: totalCombinations });
      return result;
    });

    const remainingResults = await runWithConcurrency(trackingTasks, MAX_CONCURRENT_REQUESTS);
    allResults.push(...remainingResults);
  }

  // 5. Merge by confidence
  onProgress?.({ status: "merging", completed: totalCombinations, total: totalCombinations });
  const { replacements, candidateMap } = mergeByConfidence(allResults, blocks);

  // 6. Apply replacements
  onProgress?.({ status: "applying", message: "Generating consent document..." });
  const outputBuffer = await docxReplace(templateBuffer, replacements);

  // 7. Calculate stats
  const deleteCount = Object.values(replacements).filter((v) => v === null).length;
  const replaceCount = Object.keys(replacements).length - deleteCount;
  const confidences = Array.from(candidateMap.values())
    .map((c) => c.confidence)
    .filter((c) => typeof c === "number" && !isNaN(c));
  const avgConfidence =
    confidences.length > 0
      ? (confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1)
      : 0;

  onProgress?.({ status: "completed" });

  return {
    outputBuffer,
    replacements,
    stats: {
      protocolChunks: protocolChunks.length,
      templateChunks: templateChunks.length,
      totalCombinations,
      totalBlocks: blocks.length,
      deleteCount,
      replaceCount,
      avgConfidence,
    },
  };
}
// #endregion

// #region Page Component
// The UI lets users upload a protocol, select templates, and generate consent documents.
// State is persisted to IndexedDB so users can resume or retry failed jobs.

export default function Page() {
  let db = null;

  // #region State
  // Central store holds input file, selected templates, job status, and cached templates/libraries.
  const defaultStore = {
    // Session
    id: null,

    // Input - single File blob
    inputFile: null,

    // Basic template selection - array of template IDs
    selectedTemplates: [],

    // Advanced options
    model: MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5,
    advancedOptionsOpen: false,
    templateSourceType: "predefined",
    selectedPredefinedTemplate: "",
    customTemplateFile: null,
    customLibraryUrl: "",

    // Job results - each job stores complete config for easy retry
    generatedDocuments: {},

    // Template cache - fetched templates stored as Files
    templateCache: {},

    // Library cache - fetched library text
    libraryCache: {},

    // Extraction progress tracking
    extractionProgress: {
      status: "idle", // 'idle' | 'extracting' | 'priming' | 'processing' | 'merging' | 'applying' | 'completed' | 'error'
      completed: 0,
      total: 0,
      protocolChunks: 0,
      templateChunks: 0,
    },

    // Timestamps
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const [store, setStore] = createStore(structuredClone(defaultStore));

  const [session] = createResource(() => fetch("/api/session").then((res) => res.json()));
  // #endregion

  // #region Session Persistence
  // Sessions are saved to IndexedDB. URL param ?id=X loads a previous session.
  // Interrupted jobs (status=processing) are auto-retried on page load.

  function setParam(key, value) {
    const url = new URL(window.location);
    value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }

  async function createSession() {
    const session = { ...unwrap(store), createdAt: Date.now(), updatedAt: Date.now() };
    delete session.id; // allow auto-increment
    const id = await db.add("sessions", session);
    return id;
  }

  async function saveSession() {
    const session = { ...unwrap(store), updatedAt: Date.now() };
    return await db.put("sessions", session);
  }

  async function loadSession(id) {
    const session = await db.get("sessions", +id);
    setStore(session);
  }

  // Initialize database and load session on mount
  createEffect(async () => {
    const user = session()?.user;
    if (!user?.email) return;
    db = await getDatabase(user.email);

    const sessionId = new URLSearchParams(window.location.search).get("id");
    if (sessionId) {
      await loadSession(sessionId);

      // Auto-retry interrupted jobs
      const interruptedJobs = Object.entries(store.generatedDocuments).filter(
        ([_id, job]) => job.status === "processing"
      );

      for (const [jobId] of interruptedJobs) {
        retryJob(jobId);
      }
    }
  });
  // #endregion

  // #region Template Caching
  // Templates and consent libraries are fetched once and cached in store.
  // Pre-fetching happens when user selects templates, so they're ready at submit time.

  async function fetchAndCacheTemplate(templateId) {
    if (store.templateCache[templateId]) {
      return store.templateCache[templateId];
    }

    const config = templateConfigs[templateId];
    const response = await fetch(config.templateUrl);
    const arrayBuffer = await response.arrayBuffer();
    const file = new File([arrayBuffer], `${templateId}.docx`, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    setStore("templateCache", templateId, file);
    return file;
  }

  async function fetchAndCacheLibrary(templateId) {
    const config = templateConfigs[templateId];
    if (!config.libraryUrl) return "";

    if (store.libraryCache[config.libraryUrl]) {
      return store.libraryCache[config.libraryUrl];
    }

    const response = await fetch(config.libraryUrl);
    const text = await response.text();
    setStore("libraryCache", config.libraryUrl, text);
    return text;
  }
  // #endregion

  // #region Effects
  // Reactive effects: pre-fetch templates when selected (both basic and advanced options).

  createEffect(async () => {
    // Gather all template IDs that need fetching
    const templateIds = [
      ...store.selectedTemplates,
      store.templateSourceType === "predefined" && store.selectedPredefinedTemplate,
    ].filter(Boolean);

    for (const templateId of templateIds) {
      try {
        await fetchAndCacheTemplate(templateId);
        await fetchAndCacheLibrary(templateId);
      } catch (error) {
        console.error(`Failed to fetch template ${templateId}:`, error);
      }
    }
  });
  // #endregion

  // #region Computed
  // Derived state: whether all jobs are done (for showing download all), whether submit is disabled.

  const allJobsProcessed = createMemo(() => {
    const jobs = store.generatedDocuments;
    const jobKeys = Object.keys(jobs);
    if (jobKeys.length === 0) return true;
    return jobKeys.every((key) => jobs[key].status === "completed" || jobs[key].status === "error");
  });

  const submitDisabled = createMemo(() => {
    // Must have input file
    if (!store.inputFile) return true;

    // Check if we have either basic templates OR valid advanced options
    const hasBasicTemplates = store.selectedTemplates.length > 0;

    const hasValidAdvancedOptions =
      store.advancedOptionsOpen &&
      ((store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) ||
        (store.templateSourceType === "custom" && store.customTemplateFile));

    return !(hasBasicTemplates || hasValidAdvancedOptions);
  });
  // #endregion

  // #region Job Processing
  // Each selected template becomes a "job". Jobs run in parallel and can be retried individually.

  async function processJob(jobId, jobConfig) {
    setStore("generatedDocuments", jobId, {
      status: "processing",
      blob: null,
      error: null,
      config: jobConfig,
    });

    setStore("extractionProgress", {
      status: "idle",
      completed: 0,
      total: 0,
      protocolChunks: 0,
      templateChunks: 0,
    });

    await saveSession();

    try {
      // Load template buffer
      const templateBuffer = await jobConfig.templateFile.arrayBuffer();

      // Load consent library if URL provided
      let libraryText = "";
      if (jobConfig.libraryUrl) {
        if (store.libraryCache[jobConfig.libraryUrl]) {
          libraryText = store.libraryCache[jobConfig.libraryUrl];
        } else {
          const libraryResponse = await fetch(jobConfig.libraryUrl);
          libraryText = await libraryResponse.text();
          setStore("libraryCache", jobConfig.libraryUrl, libraryText);
        }
      }

      // Run block-based generation
      const result = await runBlockBasedGeneration(
        templateBuffer,
        jobConfig.inputText,
        libraryText,
        jobConfig.model,
        runModel,
        (progress) => {
          setStore("extractionProgress", progress);
        }
      );

      // Create blob from output buffer
      const type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const blob = new Blob([result.outputBuffer], { type });

      setStore("generatedDocuments", jobId, {
        status: "completed",
        blob,
        stats: result.stats,
        error: null,
        config: jobConfig,
      });
    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      setStore("generatedDocuments", jobId, {
        status: "error",
        blob: null,
        error: error.message,
        config: jobConfig,
      });
      setStore("extractionProgress", "status", "error");
    } finally {
      await saveSession();
    }
  }

  async function retryJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job?.config) return;

    await processJob(jobId, job.config);
  }
  // #endregion

  // #region Event Handlers
  // Submit parses the protocol, creates jobs for each selected template, and starts processing.
  // Reset clears store and URL. runModel calls the backend API. Download triggers file save.

  async function handleSubmit(event) {
    event?.preventDefault();

    if (submitDisabled()) return;

    const inputText = await parseDocument(
      await store.inputFile.arrayBuffer(),
      store.inputFile.type,
      store.inputFile.name
    );

    const jobs = [];

    // Create jobs for basic template selections
    for (const templateId of store.selectedTemplates) {
      const jobId = crypto.randomUUID();
      const config = templateConfigs[templateId];
      const templateFile = store.templateCache[templateId];

      if (!templateFile) {
        console.error(`Template ${templateId} not cached`);
        continue;
      }

      const jobConfig = {
        inputFile: store.inputFile,
        inputText,
        templateFile,
        templateId,
        libraryUrl: config.libraryUrl,
        model: store.model,
        displayInfo: {
          prefix: config.prefix || "",
          label: config.label,
          filename: config.filename,
        },
      };

      jobs.push({ jobId, jobConfig });
    }

    // Create job for advanced options if configured
    if (store.advancedOptionsOpen) {
      if (store.templateSourceType === "predefined" && store.selectedPredefinedTemplate) {
        const jobId = crypto.randomUUID();
        const config = templateConfigs[store.selectedPredefinedTemplate];
        const templateFile = store.templateCache[store.selectedPredefinedTemplate];

        if (templateFile) {
          const jobConfig = {
            inputFile: store.inputFile,
            inputText,
            templateFile,
            templateId: store.selectedPredefinedTemplate,
            libraryUrl: config.libraryUrl,
            model: store.model,
            displayInfo: {
              prefix: config.prefix || "",
              label: config.label + " (Custom)",
              filename: config.filename.replace(".docx", "-custom.docx"),
            },
          };

          jobs.push({ jobId, jobConfig });
        }
      } else if (store.templateSourceType === "custom" && store.customTemplateFile) {
        const jobId = crypto.randomUUID();

        const jobConfig = {
          inputFile: store.inputFile,
          inputText,
          templateFile: store.customTemplateFile,
          templateId: null,
          libraryUrl: store.customLibraryUrl || null,
          model: store.model,
          displayInfo: {
            prefix: "Custom",
            label: "Custom Document",
            filename: "custom-document.docx",
          },
        };

        jobs.push({ jobId, jobConfig });
      }
    }

    if (jobs.length === 0) return;

    // Clear previous results (merge to replace nested object)
    setStore("generatedDocuments", reconcile({}, { merge: true }));
    setStore("id", await createSession());
    setParam("id", store.id);

    // Start all jobs in parallel
    for (const { jobId, jobConfig } of jobs) {
      processJob(jobId, jobConfig);
    }
  }

  async function handleReset(event) {
    event?.preventDefault();
    setStore(structuredClone(defaultStore));
    setParam("id", null);
  }

  async function runModel(params) {
    const response = await fetch("/api/model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error("Network response was not ok");
    }

    const data = await response.json();
    const text = data.output?.message?.content?.map((c) => c.text || "").join(" ") || "";
    return text;
  }

  async function downloadJob(jobId) {
    const job = store.generatedDocuments[jobId];
    if (!job?.blob || job.status !== "completed") return;

    const timestamp = createTimestamp();
    const baseFilename = job.config.displayInfo.filename;
    const filename = baseFilename.replace(".docx", `-${timestamp}.docx`);
    downloadBlob(filename, job.blob);
  }

  function downloadAll() {
    Object.keys(store.generatedDocuments).forEach((jobId) => {
      if (store.generatedDocuments[jobId].status === "completed") {
        downloadJob(jobId);
      }
    });
  }

  function getProgressMessage(progress) {
    if (progress.status === "idle" || progress.total === 0) {
      return "We are generating your forms now. This may take a few moments.";
    }
    const messages = {
      extracting: "Extracting template blocks...",
      chunked: `Preparing ${progress.protocolChunks} protocol chunks × ${progress.templateChunks} template chunks...`,
      priming: `Priming cache (${progress.completed}/${progress.total})...`,
      processing: `Processing combinations (${progress.completed}/${progress.total})...`,
      merging: "Merging results by confidence...",
      applying: "Generating consent document...",
      completed: "Generation complete.",
      error: "An error occurred during generation.",
    };
    return messages[progress.status] || "Processing...";
  }
  // #endregion

  // #region Render
  // Two-column layout: left side for input (file upload, template selection), right side for results.

  return html`
    <div class="bg-info-subtle h-100 position-relative">
      <${AlertContainer} alerts=${alerts} onDismiss=${clearAlert} />
      <div class="container py-3">
        <form onSubmit=${handleSubmit} onReset=${handleReset}>
          <div class="row align-items-stretch">
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div class="bg-white shadow rounded p-3 card-lg">
                <label class="form-label required text-info fs-5 mb-1">Source Document</label>
                <${FileInput}
                  value=${() => [store.inputFile]}
                  onChange=${(ev) => setStore("inputFile", ev.target.files[0] || null)}
                  accept="text/*,.doc,.docx,.pdf"
                  class="form-control form-control-sm mb-3"
                />

                <!-- Template Selection -->
                <div class="mb-3">
                  <label class="form-label required text-info fs-5 mb-1">Form Templates</label>
                  <div class="border rounded p-2">
                    <${For} each=${getTemplateConfigsByCategory}>
                      ${(group) => html`
                        <div class="mb-2">
                          <div class="fw-bold text-muted small">${() => group.label}</div>
                          <${For} each=${() => group.options}>
                            ${(option) => html`
                              <div class="form-check form-control-sm min-height-auto py-0 ms-1">
                                <input
                                  class="form-check-input cursor-pointer"
                                  type="checkbox"
                                  id=${() => option.value}
                                  disabled=${() => option.disabled}
                                  checked=${() => store.selectedTemplates.includes(option.value)}
                                  onChange=${(e) =>
                                    setStore("selectedTemplates", (prev) =>
                                      e.target.checked
                                        ? prev.concat([option.value])
                                        : prev.filter((v) => v !== option.value)
                                    )}
                                />
                                <label
                                  class="form-check-label cursor-pointer"
                                  classList=${() => ({ "text-muted": option.disabled })}
                                  for=${() => option.value}
                                >
                                  ${() => templateConfigs[option.value].label}
                                </label>
                              </div>
                            `}
                          <//>
                        </div>
                      `}
                    <//>
                  </div>
                </div>

                <div class="d-flex flex-wrap justify-content-between align-items-center">
                  <${Show} when=${() => [1, 2].includes(session()?.user?.Role?.id)}>
                    <details
                      class="small text-secondary mt-2"
                      open=${() => store.advancedOptionsOpen}
                      onToggle=${(e) => setStore("advancedOptionsOpen", e.target.open)}
                    >
                      <summary class="form-label text-info fs-5 mb-1">Advanced Options</summary>
                      <div class="border rounded p-2">
                        <label for="model" class="form-label required">Default Model</label>
                        <select
                          class="form-select form-select-sm cursor-pointer mb-2"
                          name="model"
                          id="model"
                          value=${() => store.model}
                          onChange=${(e) => setStore("model", e.target.value)}
                        >
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.OPUS.v4_5}>Opus 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v4_5}>Sonnet 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.SONNET.v3_7}>Sonnet 3.7</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.HAIKU.v4_5}>Haiku 4.5</option>
                          <option value=${MODEL_OPTIONS.AWS_BEDROCK.MAVERICK.v4_0_17b}>
                            Maverick
                          </option>
                        </select>

                        <div class="d-flex justify-content-between">
                          <label class="form-label">Form Template</label>
                          <div>
                            <div class="form-check form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourcePredefined"
                                value="predefined"
                                checked=${() => store.templateSourceType === "predefined"}
                                onChange=${(e) => setStore("templateSourceType", e.target.value)}
                              />
                              <label class="form-check-label" for="templateSourcePredefined">
                                Predefined template
                              </label>
                            </div>
                            <div class="form-check form-check-inline">
                              <input
                                class="form-check-input"
                                type="radio"
                                name="templateSource"
                                id="templateSourceCustom"
                                value="custom"
                                checked=${() => store.templateSourceType === "custom"}
                                onChange=${(e) => setStore("templateSourceType", e.target.value)}
                              />
                              <label class="form-check-label" for="templateSourceCustom">
                                Custom template
                              </label>
                            </div>
                          </div>
                        </div>

                        <${Show} when=${() => store.templateSourceType === "predefined"}>
                          <div class="input-group mb-2">
                            <select
                              class="form-select form-select-sm cursor-pointer"
                              name="predefinedTemplate"
                              id="predefinedTemplate"
                              value=${() => store.selectedPredefinedTemplate}
                              onChange=${(e) =>
                                setStore("selectedPredefinedTemplate", e.target.value)}
                            >
                              <option value="">[No Template]</option>
                              <${For} each=${getTemplateConfigsByCategory}>
                                ${(group) => html`
                                  <optgroup label=${() => group.label}>
                                    <${For} each=${() => group.options}>
                                      ${(option) => html`
                                        <option
                                          value=${() => option.value}
                                          disabled=${() => option.disabled}
                                        >
                                          ${() =>
                                            `${templateConfigs[option.value].prefix} - ${templateConfigs[option.value].label}`}
                                        </option>
                                      `}
                                    <//>
                                  </optgroup>
                                `}
                              <//>
                            </select>
                          </div>
                        <//>

                        <${Show} when=${() => store.templateSourceType === "custom"}>
                          <${FileInput}
                            value=${() => [store.customTemplateFile]}
                            onChange=${(ev) =>
                              setStore("customTemplateFile", ev.target.files[0] || null)}
                            accept=".docx"
                            class="form-control form-control-sm mb-2"
                          />
                          <label class="form-label">Consent Library URL (optional)</label>
                          <input
                            type="text"
                            class="form-control form-control-sm mb-2"
                            placeholder="/templates/nih-cc/consent-library.txt"
                            value=${() => store.customLibraryUrl}
                            onInput=${(e) => setStore("customLibraryUrl", e.target.value)}
                          />
                        <//>
                      </div>
                    </details>
                  <//>
                </div>
              </div>
            </div>
            <div class="col-md-6 mb-2 d-flex flex-column flex-grow-1">
              <div
                class="d-flex flex-column bg-white shadow border rounded p-3 flex-grow-1 card-lg"
              >
                <${Show}
                  when=${() => Object.keys(store.generatedDocuments).length > 0}
                  fallback=${html`<div class="d-flex h-100 py-5">
                    <div class="text-center py-5">
                      <h1 class="text-info mb-3">Welcome to Consent Crafter</h1>
                      <div>
                        To get started, upload your source document, select one or more form
                        templates from the list, and click Generate to create tailored consent
                        documents.
                      </div>
                    </div>
                  </div>`}
                >
                  <div class="d-flex flex-column gap-2">
                    <div class="text-muted small fw-semibold">
                      <${Show}
                        when=${allJobsProcessed}
                        fallback=${() => getProgressMessage(store.extractionProgress)}
                      >
                        All processing is complete. The generated forms are available for download.
                      <//>
                    </div>
                    <!-- Progress bar -->
                    <${Show} when=${() => !allJobsProcessed() && store.extractionProgress.total > 0}>
                      <div class="progress" style="height: 6px;">
                        <div
                          class="progress-bar"
                          role="progressbar"
                          style=${() =>
                            `width: ${Math.round((store.extractionProgress.completed / store.extractionProgress.total) * 100)}%`}
                          aria-valuenow=${() => store.extractionProgress.completed}
                          aria-valuemin="0"
                          aria-valuemax=${() => store.extractionProgress.total}
                        ></div>
                      </div>
                    <//>

                    <${For} each=${() => Object.keys(store.generatedDocuments)}>
                      ${(jobId) => {
                        const job = () => store.generatedDocuments[jobId];

                        return html`
                          <div
                            class="d-flex justify-content-between align-items-center p-2 border rounded"
                          >
                            <div class="flex-grow-1">
                              <div class="fw-medium">
                                <span>${() => job().config?.displayInfo?.prefix || ""}</span>
                                <span class="text-muted fw-normal">
                                  : ${() => job().config?.displayInfo?.label || "Unknown"}</span
                                >
                              </div>
                              <div class="small text-muted">
                                ${() => job().config?.displayInfo?.filename || "document.docx"}
                                <${Show} when=${() => job().stats}>
                                  <span class="ms-2">
                                    (${() => job().stats?.replaceCount || 0} replaced,
                                    ${() => job().stats?.deleteCount || 0} deleted, confidence:
                                    ${() => job().stats?.avgConfidence || 0})
                                  </span>
                                <//>
                              </div>
                            </div>
                            <${Show} when=${() => job()?.status === "processing"}>
                              <div
                                class="spinner-border spinner-border-sm text-primary me-2"
                                role="status"
                              >
                                <span class="visually-hidden">Processing...</span>
                              </div>
                            <//>
                            <${Show} when=${() => job()?.status === "completed"}>
                              <button
                                type="button"
                                class="btn btn-outline-light"
                                onClick=${() => downloadJob(jobId)}
                              >
                                <img
                                  src="/assets/images/icon-download.svg"
                                  height="16"
                                  alt="Download"
                                />
                              </button>
                            <//>
                            <${Show} when=${() => job()?.status === "error"}>
                              <div class="d-flex align-items-center gap-2">
                                <button
                                  type="button"
                                  class="btn btn-sm btn-outline-danger"
                                  title=${() => job().error}
                                  onClick=${() => retryJob(jobId)}
                                >
                                  Retry
                                </button>
                              </div>
                            <//>
                          </div>
                        `;
                      }}
                    <//>
                  </div>
                  <${Show} when=${allJobsProcessed}>
                    <div class="h-100 d-flex flex-column justify-content-between">
                      <div class="text-end">
                        <button
                          type="button"
                          class="btn btn-sm btn-link fw-semibold p-0"
                          onClick=${downloadAll}
                        >
                          Download All
                        </button>
                      </div>
                      <div class="mt-auto d-flex align-items-center">
                        <img
                          src="/assets/images/icon-star.svg"
                          alt="Star"
                          class="me-2"
                          height="16"
                        />
                        <div>
                          <span class="me-1">We would love your feedback!</span>
                          <a href="https://www.cancer.gov/" target="_blank">Take a quick survey</a>
                          &nbsp;to help us improve.
                        </div>
                      </div>
                    </div>
                  <//>
                <//>
              </div>
            </div>
          </div>
          <div class="row">
            <div class="col-md-6">
              <div class="d-flex-center mt-1 gap-1">
                <button type="reset" class="btn btn-wide btn-wide-info px-3 py-3">Reset</button>
                <${Tooltip}
                  title="Not all required fields are provided."
                  placement="top"
                  arrow=${true}
                  class="text-white bg-primary"
                  disableHoverListener=${() => !submitDisabled()}
                >
                  <button
                    toggle
                    type="submit"
                    class="btn btn-wide px-3 py-3 btn-wide-primary"
                    disabled=${submitDisabled}
                  >
                    Generate
                  </button>
                <//>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  // #endregion
}
// #endregion
