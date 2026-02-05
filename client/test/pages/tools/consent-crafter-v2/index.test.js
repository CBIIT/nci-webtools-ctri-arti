/**
 * Integration test for Consent Crafter v2
 *
 * Tests the new prompt structure (template first, protocol middle, rules reminder at end)
 * and single-chunk template processing.
 *
 * DEBUGGING: This test includes extensive logging to help debug issues with:
 * - Blocks being incorrectly DELETED instead of REPLACED
 * - Missing procedure/risk content
 * - Merge conflicts between chunk responses
 *
 * Run with: cd server && npm run test:integration
 * Output is logged to console (capture with: npm run test:integration > output.txt 2>&1)
 */
import test from "/test/test.js";
import assert from "/test/assert.js";
import { docxExtractTextBlocks, docxReplace } from "/utils/docx.js";
import {
  buildBlockSystemPrompt,
  buildBlockUserPrompt,
  buildExtractionSystemPrompt,
  buildExtractionUserPrompt
} from "/pages/tools/consent-crafter-v2/index.js";

// Get API key from URL for authenticated requests
const urlParams = new URLSearchParams(window.location.search);
const TEST_API_KEY = urlParams.get("apiKey");

// Constants - MUST match the main index.js file for accurate testing
const PROTOCOL_CHUNK_SIZE = 20000;
const PROTOCOL_OVERLAP = 2000;
const TEMPLATE_CHUNK_SIZE = 100; // Larger value for fewer template chunks (was 40)
const TEMPLATE_OVERLAP = 10;
const MAX_CONCURRENT_REQUESTS = 50;

// Verification turn prompt - generic prompt to double-check work after initial response
const VERIFICATION_PROMPT = `Now double-check your response.

## Review Checklist

1. **Completeness**: Did you process ALL blocks in the range? Are there any instruction blocks you should have REPLACED with content but marked as DELETE instead?

2. **Library Usage**: For any procedures, risks, or standardized language - did you use EXACT text from the <consent_library>? The text should match character-for-character, not be paraphrased.

3. **Missing Content**: Review the protocol excerpt again. Is there any relevant information you didn't extract that should fill a template block?

4. **Placeholders**: Did you leave any [bracketed placeholders] unfilled that you could fill with protocol data?

5. **procedure_library Field**: For any content you pulled from the consent library, did you include the procedure_library field showing the exact source?

6. **Procedure Completeness**: Count the procedure headings in your output for the risks section. Does the count match the number specified in the system prompt's "CRITICAL: PROCEDURE RISKS" section? If the system prompt says "ALL X PROCEDURES", you MUST have X separate procedure headings. Missing any is a critical error. Sedation and Local Anesthesia are SEPARATE from Biopsy.

## Your Task

If you find ANY corrections, additions, or improvements:
- Output them as a JSON array
- Use the same format: {index, action, content, confidence, reasoning, procedure_library}

If your response was complete and correct, output: []`;

// Final verification prompt - reviews the complete merged output for duplicates and issues
const FINAL_VERIFICATION_PROMPT = `You are reviewing a generated consent document for quality issues.

## Your Task

Review the replacement map and generated document text below. Identify:

1. **DUPLICATE CONTENT**: Multiple blocks with the same or very similar content (e.g., drug side effects appearing in blocks 94, 96, AND 97). Keep the BEST/most complete version, set others to null.

2. **DUPLICATE HEADINGS**: If a heading appears twice (e.g., "What are the risks related to pregnancy?" in both block 99 and 100), keep one and null the other.

3. **REDUNDANT SECTIONS**: If the same information appears multiple times (e.g., pregnancy risks, blood draw risks), keep the most complete version and null duplicates.

4. **MISSING CONTENT**: Blocks that should have content but are null or empty.

5. **Procedure Coverage**: Check that all study procedures have corresponding risk entries. Missing procedures should be flagged.

## Output Format

Output a JSON object with corrections:
\`\`\`json
{
  "corrections": [
    {"index": 96, "action": "DELETE", "reason": "Duplicate of block 94 drug side effects"},
    {"index": 97, "action": "DELETE", "reason": "Duplicate of block 94 drug side effects"},
    {"index": 91, "action": "DELETE", "reason": "Duplicate of block 90 participant count"}
  ],
  "summary": "Found 3 duplicate blocks to remove"
}
\`\`\`

If no corrections needed, output:
\`\`\`json
{"corrections": [], "summary": "No duplicates or issues found"}
\`\`\`

## REPLACEMENT MAP (block index → content or null)

<replacement_map>
%REPLACEMENT_MAP%
</replacement_map>

## GENERATED DOCUMENT TEXT (with block indices)

<generated_text>
%GENERATED_TEXT%
</generated_text>

Now review for duplicates and issues. Output JSON corrections.`;

// NOTE: Procedure extraction prompt removed - now using buildExtractionSystemPrompt from index.js

// ============================================================
// DEBUG CONFIG: Blocks to watch closely during processing
// These are blocks that have been problematic (deleted instead of replaced)
// ============================================================
const WATCH_BLOCKS = [
  // AI DISCLAIMER - MUST BE KEPT (currently being deleted!)
  45, 46,
  // KEY INFORMATION section
  56, 57, 58,
  // WHY IS THIS STUDY BEING DONE
  64, 65, 66, 67,
  // WHAT WILL HAPPEN - these are instruction blocks that should be REPLACED not deleted
  68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82,
  // HOW LONG / HOW MANY
  84, 85, 90, 91, 92,
  // RISKS section
  94, 95, 96, 97, 98, 99, 100,
];

function chunkProtocol(text, chunkSize = PROTOCOL_CHUNK_SIZE, overlap = PROTOCOL_OVERLAP) {
  const chunks = [];
  const step = chunkSize - overlap;
  for (let i = 0; i < text.length; i += step) {
    const endChar = Math.min(i + chunkSize, text.length);
    chunks.push({ index: chunks.length, text: text.slice(i, endChar), startChar: i, endChar });
    if (endChar >= text.length) break;
  }
  return chunks;
}

function chunkTemplateBlocks(blocks, chunkSize = TEMPLATE_CHUNK_SIZE, overlap = TEMPLATE_OVERLAP) {
  const chunks = [];
  const step = chunkSize - overlap;
  for (let i = 0; i < blocks.length; i += step) {
    const endIdx = Math.min(i + chunkSize, blocks.length);
    chunks.push({
      index: chunks.length,
      blocks: blocks.slice(i, endIdx),
      startIdx: i,
      endIdx: endIdx,
    });
    if (endIdx >= blocks.length) break;
  }
  return chunks;
}

function isLikelySectionHeading(block) {
  if (!block) return false;
  const style = (block.style || "").toLowerCase();
  if (style.includes("heading") || style === "title") return true;
  const text = block.text;
  if (!text) return false;
  const trimmed = text.trim();
  const uppercaseLetters = trimmed.replace(/[^A-Z]/g, "").length;
  const totalLetters = trimmed.replace(/[^A-Za-z]/g, "").length;
  if (totalLetters >= 3 && uppercaseLetters / totalLetters > 0.8) return true;
  return false;
}

function computeSectionMap(blocks) {
  const sectionMap = {};
  let currentSection = "Document Start";
  for (const block of blocks) {
    if (isLikelySectionHeading(block)) {
      currentSection = block.text.trim().slice(0, 60);
    }
    sectionMap[block.index] = currentSection;
  }
  return sectionMap;
}

async function runWithConcurrency(tasks, maxConcurrent) {
  const results = [];
  const executing = new Set();
  for (const task of tasks) {
    const promise = task().then((result) => { executing.delete(promise); return result; });
    executing.add(promise);
    results.push(promise);
    if (executing.size >= maxConcurrent) await Promise.race(executing);
  }
  return Promise.all(results);
}

async function runModel(params) {
  const headers = { "Content-Type": "application/json" };
  if (TEST_API_KEY) headers["x-api-key"] = TEST_API_KEY;

  const response = await fetch("/api/model", {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`Network response was not ok: ${response.status}`);
  const data = await response.json();
  return data.output?.message?.content?.map((c) => c.text || "").join(" ") || "";
}

function parseJsonResponse(response) {
  let jsonStr = response.trim();
  if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
  try {
    return { success: true, data: JSON.parse(jsonStr.trim()), error: null };
  } catch (e) {
    return { success: false, data: [], error: e.message };
  }
}

/**
 * Extract metadata from a single protocol chunk using Pipeline 1.
 * Uses the extraction system prompt with full consent library and template context.
 */
async function extractMetadataFromChunk(protocolChunk, extractionSystemPrompt, model) {
  const userPrompt = buildExtractionUserPrompt(protocolChunk);
  const response = await runModel({
    model,
    messages: [{ role: "user", content: [{ text: userPrompt }] }],
    system: extractionSystemPrompt,
    thoughtBudget: 8000,
    stream: false,
  });
  const result = parseJsonResponse(response);
  if (result.success) {
    result.chunkIndex = protocolChunk.index;
  }
  return result;
}

/**
 * Aggregate metadata from all extraction results into a unified object.
 * Deduplicates procedures by library_section, merges metadata values.
 */
function aggregateExtractedMetadata(results) {
  const proceduresBySection = new Map();
  const metadataByKey = new Map();
  let drugToxicity = null;

  for (const r of results) {
    if (!r.success || !r.data) continue;
    const data = r.data;

    // Aggregate procedures - dedupe by library_section, keep the one with longest quotes
    if (data.procedures && Array.isArray(data.procedures)) {
      for (const p of data.procedures) {
        const key = (p.library_section || p.name || "").toUpperCase();
        const existing = proceduresBySection.get(key);
        if (!existing) {
          proceduresBySection.set(key, p);
        } else {
          // Keep the one with longer quotes (more complete extraction)
          const existingLen = (existing.protocol_quote?.length || 0) + (existing.library_quote?.length || 0);
          const candidateLen = (p.protocol_quote?.length || 0) + (p.library_quote?.length || 0);
          if (candidateLen > existingLen) {
            proceduresBySection.set(key, p);
          }
        }
      }
    }

    // Aggregate metadata - dedupe by key, keep the one with longer quote
    if (data.metadata && Array.isArray(data.metadata)) {
      for (const m of data.metadata) {
        const key = m.key?.toLowerCase() || "";
        const existing = metadataByKey.get(key);
        if (!existing) {
          metadataByKey.set(key, m);
        } else if ((m.quote?.length || 0) > (existing.quote?.length || 0)) {
          metadataByKey.set(key, m);
        }
      }
    }

    // Take the most complete drug toxicity
    if (data.drug_toxicity && data.drug_toxicity.drug_name) {
      if (!drugToxicity) {
        drugToxicity = data.drug_toxicity;
      } else {
        // Keep the one with more side effects listed
        const existingCount = (drugToxicity.common?.length || 0) +
          (drugToxicity.occasional?.length || 0) +
          (drugToxicity.rare?.length || 0);
        const candidateCount = (data.drug_toxicity.common?.length || 0) +
          (data.drug_toxicity.occasional?.length || 0) +
          (data.drug_toxicity.rare?.length || 0);
        if (candidateCount > existingCount) {
          drugToxicity = data.drug_toxicity;
        }
      }
    }
  }

  return {
    procedures: Array.from(proceduresBySection.values()),
    metadata: Array.from(metadataByKey.values()),
    drug_toxicity: drugToxicity,
  };
}

/**
 * Build system prompt for Pipeline 2 using extracted metadata.
 * Now calls buildBlockSystemPrompt with the new extractedMetadata parameter.
 */
function buildBlockSystemPromptWithMetadata(libraryText, extractedMetadata) {
  // Convert new metadata format to legacy procedures format for backwards compatibility
  const extractedProcedures = extractedMetadata?.procedures?.map(p => ({
    name: p.name,
    library_match: p.library_section,
  })) || [];

  // Call buildBlockSystemPrompt with both legacy and new format
  return buildBlockSystemPrompt(libraryText, "adult-patient", extractedProcedures, extractedMetadata);
}

test("Consent Crafter v2 Full Generation", async (t) => {
  await t.test("generate consent form and log results", async () => {
    console.log("=".repeat(80));
    console.log("=== Consent Crafter v2 Integration Test ===");
    console.log("=".repeat(80));
    console.log(`\nWATCH_BLOCKS: ${WATCH_BLOCKS.join(", ")}`);
    console.log("These blocks will be logged in detail during processing.\n");

    // 1. Load resources
    const [protocolRes, templateRes, libraryRes] = await Promise.all([
      fetch("/templates/nih-cc/protocol.txt"),
      fetch("/templates/nih-cc/2026_01_26_NIH_Consent_Template_for_use_at_the_NIH_Clinical_Center__v14.docx"),
      fetch("/templates/nih-cc/consent-library.txt"),
    ]);

    assert.ok(protocolRes.ok, "Protocol should load");
    assert.ok(templateRes.ok, "Template should load");

    const protocolText = await protocolRes.text();
    const templateBuffer = await templateRes.arrayBuffer();
    const libraryText = libraryRes.ok ? await libraryRes.text() : "";

    console.log(`Protocol: ${protocolText.length} chars`);
    console.log(`Template: ${templateBuffer.byteLength} bytes`);
    console.log(`Library: ${libraryText.length} chars`);

    // 2. Extract blocks
    const { blocks } = await docxExtractTextBlocks(templateBuffer, { includeFormatting: true });
    console.log(`Blocks: ${blocks.length}\n`);

    // ============================================================
    // DEBUG: Log the original template blocks we're watching
    // ============================================================
    console.log("=".repeat(80));
    console.log("=== ORIGINAL TEMPLATE BLOCKS (WATCH LIST) ===");
    console.log("=".repeat(80));
    for (const block of blocks) {
      if (WATCH_BLOCKS.includes(block.index)) {
        const preview = block.text.slice(0, 150).replace(/\n/g, "\\n");
        const hasFormatting = block.runs && block.runs.length > 0;
        let fmtSummary = "";
        if (hasFormatting) {
          const colors = block.runs.filter(r => r.color).map(r => r.color);
          const hasItalic = block.runs.some(r => r.italic);
          const hasYellow = block.runs.some(r => r.highlight === "yellow");
          fmtSummary = ` [fmt: ${colors.length ? "color:" + colors[0] : ""}${hasItalic ? " italic" : ""}${hasYellow ? " YELLOW" : ""}]`;
        }
        console.log(`[@${block.index}] ${block.style}${fmtSummary}`);
        console.log(`  Section: "${block.section || "unknown"}"`);
        console.log(`  Text: "${preview}${block.text.length > 150 ? "..." : ""}"`);
        console.log("");
      }
    }

    // 3. Compute GLOBAL section map and attach to blocks before chunking
    const sectionMap = computeSectionMap(blocks);
    for (const block of blocks) {
      block.section = sectionMap[block.index];
    }

    // 4. Chunk inputs
    const protocolChunks = chunkProtocol(protocolText);
    const templateChunks = chunkTemplateBlocks(blocks);
    const totalCombinations = protocolChunks.length * templateChunks.length;

    console.log("=".repeat(80));
    console.log(`Protocol chunks: ${protocolChunks.length}`);
    console.log(`Template chunks: ${templateChunks.length}`);
    console.log(`Total combinations: ${totalCombinations}`);
    console.log("=".repeat(80));

    // Log which template chunks contain our watch blocks
    for (const tChunk of templateChunks) {
      const watchInChunk = tChunk.blocks.filter(b => WATCH_BLOCKS.includes(b.index)).map(b => b.index);
      if (watchInChunk.length > 0) {
        console.log(`Template chunk ${tChunk.index} (blocks ${tChunk.startIdx}-${tChunk.endIdx - 1}) contains WATCH blocks: ${watchInChunk.join(", ")}`);
      }
    }
    console.log("");

    // ============================================================
    // PIPELINE 1: Metadata Extraction
    // System prompt: library + template (CACHED across all protocol chunks)
    // User message: protocol chunk (VARIES)
    // ============================================================
    console.log("=".repeat(80));
    console.log("=== PIPELINE 1: METADATA EXTRACTION ===");
    console.log("=".repeat(80));

    // Build extraction system prompt ONCE (cached across all protocol chunks)
    const extractionSystemPrompt = buildExtractionSystemPrompt(libraryText, blocks);
    console.log(`Extraction system prompt size: ${extractionSystemPrompt.length} chars`);

    // Run extraction on all protocol chunks in parallel
    const extractionTasks = protocolChunks.map(chunk =>
      () => extractMetadataFromChunk(chunk, extractionSystemPrompt, "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
    );
    const extractionResults = await runWithConcurrency(extractionTasks, MAX_CONCURRENT_REQUESTS);

    // Aggregate all extracted metadata
    const extractedMetadata = aggregateExtractedMetadata(extractionResults);

    // Log extraction results in detail
    console.log(`\nExtracted ${extractedMetadata.procedures.length} procedures:`);
    for (const p of extractedMetadata.procedures) {
      console.log(`  - ${p.name} (${p.library_section})`);
      if (p.protocol_quote) console.log(`    Protocol: "${p.protocol_quote.slice(0, 100)}..."`);
      if (p.library_quote) console.log(`    Library: "${p.library_quote.slice(0, 100)}..."`);
    }
    console.log(`\nExtracted ${extractedMetadata.metadata.length} metadata values:`);
    for (const m of extractedMetadata.metadata) {
      console.log(`  - ${m.key}: ${m.value}`);
      if (m.quote) console.log(`    Quote: "${m.quote.slice(0, 80)}..."`);
    }
    if (extractedMetadata.drug_toxicity) {
      const tox = extractedMetadata.drug_toxicity;
      console.log(`\nDrug toxicity found: ${tox.drug_name}`);
      // Handle both array and string formats
      const formatList = (v) => Array.isArray(v) ? v.join(", ") : (v || "N/A");
      console.log(`  Common: ${formatList(tox.common)}`);
      console.log(`  Occasional: ${formatList(tox.occasional)}`);
      console.log(`  Rare: ${formatList(tox.rare)}`);
    }
    console.log("");

    // ============================================================
    // PIPELINE 2: Consent Generation
    // System prompt: formatting rules + extracted metadata (CACHED)
    // User message: template chunk (VARIES)
    // ============================================================
    console.log("=".repeat(80));
    console.log("=== PIPELINE 2: CONSENT GENERATION ===");
    console.log("=".repeat(80));

    // ============================================================
    // Track all candidates per block for debugging merge decisions
    // ============================================================
    const allCandidatesPerBlock = new Map(); // index -> array of {pChunk, tChunk, candidate}

    // 5. Process all combinations
    console.log("Processing... (this will take a while)\n");

    const processChunkPair = async (pChunk, tChunk) => {
      // Use the system prompt with extracted metadata (exact quotes from library)
      const systemPrompt = buildBlockSystemPromptWithMetadata(libraryText, extractedMetadata);
      const userPrompt = buildBlockUserPrompt(tChunk, pChunk, protocolChunks.length);
      const messages = [{ role: "user", content: [{ text: userPrompt }] }];

      const pairId = `P${pChunk.index}×T${tChunk.index}`;

      try {
        const response = await runModel({
          model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
          messages,
          system: systemPrompt,
          thoughtBudget: 10000,
          stream: false,
        });
        const parsed = parseJsonResponse(response);
        let candidates = parsed.success ? (Array.isArray(parsed.data) ? parsed.data : []) : [];

        // ============================================================
        // VERIFICATION TURN: Always add verification turn to double-check work
        // ============================================================
        if (parsed.success && Array.isArray(parsed.data)) {
          messages.push({ role: "assistant", content: [{ text: response }] });
          messages.push({ role: "user", content: [{ text: VERIFICATION_PROMPT }] });

          try {
            const verifyResponse = await runModel({
              model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
              messages,
              system: systemPrompt,
              thoughtBudget: 5000,
              stream: false,
            });

            const verifyParsed = parseJsonResponse(verifyResponse);
            if (verifyParsed.success && Array.isArray(verifyParsed.data) && verifyParsed.data.length > 0) {
              console.log(`\n--- ${pairId}: VERIFICATION found ${verifyParsed.data.length} corrections ---`);
              for (const c of verifyParsed.data) {
                const contentPreview = c.content ? c.content.slice(0, 80).replace(/\n/g, "\\n") : "null";
                console.log(`  [@${c.index}] ${c.action} conf=${c.confidence}: "${contentPreview}..."`);
              }
              candidates = candidates.concat(verifyParsed.data);
            }
          } catch (verifyError) {
            console.warn(`Verification turn failed for ${pairId}:`, verifyError.message);
            // Continue with original results even if verification fails
          }
        }

        // ============================================================
        // DEBUG: Log candidates for WATCH blocks from this chunk pair
        // ============================================================
        const watchCandidates = candidates.filter(c => WATCH_BLOCKS.includes(c.index));
        if (watchCandidates.length > 0) {
          console.log(`\n--- ${pairId}: Found ${watchCandidates.length} WATCH block candidates (after verification) ---`);
          for (const c of watchCandidates) {
            const contentPreview = c.content ? c.content.slice(0, 100).replace(/\n/g, "\\n") : "null";
            console.log(`  [@${c.index}] action=${c.action} confidence=${c.confidence}`);
            console.log(`    reasoning: "${(c.reasoning || "").slice(0, 100)}"`);
            console.log(`    content: "${contentPreview}${c.content && c.content.length > 100 ? "..." : ""}"`);
          }
        }

        // Store all candidates for later merge analysis
        for (const c of candidates) {
          if (!allCandidatesPerBlock.has(c.index)) {
            allCandidatesPerBlock.set(c.index, []);
          }
          allCandidatesPerBlock.get(c.index).push({ pChunk: pChunk.index, tChunk: tChunk.index, candidate: c });
        }

        return { candidates, pairId };
      } catch (error) {
        console.error(`Error ${pairId}:`, error.message);
        return { candidates: [], pairId };
      }
    };

    // Process in parallel with concurrency limit
    const tasks = [];
    for (const pChunk of protocolChunks) {
      for (const tChunk of templateChunks) {
        tasks.push(() => processChunkPair(pChunk, tChunk));
      }
    }

    let completed = 0;
    const trackingTasks = tasks.map((task) => async () => {
      const result = await task();
      completed++;
      if (completed % 10 === 0) console.log(`Progress: ${completed}/${totalCombinations}`);
      return result;
    });

    const allResults = await runWithConcurrency(trackingTasks, MAX_CONCURRENT_REQUESTS);

    // ============================================================
    // DEBUG: Log all candidates for WATCH blocks before merging
    // ============================================================
    console.log("\n" + "=".repeat(80));
    console.log("=== ALL CANDIDATES FOR WATCH BLOCKS (before merge) ===");
    console.log("=".repeat(80));
    for (const watchIdx of WATCH_BLOCKS) {
      const candidates = allCandidatesPerBlock.get(watchIdx) || [];
      if (candidates.length === 0) {
        console.log(`\n[@${watchIdx}] NO CANDIDATES - block was not in any processed template chunk!`);
        continue;
      }
      console.log(`\n[@${watchIdx}] ${candidates.length} candidates:`);
      for (const { pChunk, tChunk, candidate } of candidates) {
        const contentPreview = candidate.content ? candidate.content.slice(0, 80).replace(/\n/g, "\\n") : "null";
        console.log(`  P${pChunk}×T${tChunk}: ${candidate.action} conf=${candidate.confidence} "${contentPreview}..."`);
      }
    }

    // 6. Merge by confidence with detailed logging
    console.log("\n" + "=".repeat(80));
    console.log("=== MERGE DECISIONS FOR WATCH BLOCKS ===");
    console.log("=".repeat(80));

    const byIndex = new Map();
    const insertsByIndex = new Map();  // Separate map for INSERT actions

    for (const result of allResults) {
      for (const candidate of result.candidates || []) {
        const isWatched = WATCH_BLOCKS.includes(candidate.index);

        // Handle INSERT actions separately - they add content after a block, not replace it
        if (candidate.action === "INSERT" && candidate.content) {
          const existingInsert = insertsByIndex.get(candidate.index);
          if (!existingInsert) {
            insertsByIndex.set(candidate.index, candidate);
            if (isWatched) console.log(`[@${candidate.index}] INSERT INITIAL: "${candidate.content.slice(0, 50)}..."`);
          } else if (candidate.confidence > existingInsert.confidence) {
            insertsByIndex.set(candidate.index, candidate);
            if (isWatched) console.log(`[@${candidate.index}] INSERT OVERRIDE: higher confidence`);
          } else if (candidate.confidence === existingInsert.confidence && candidate.content.length > existingInsert.content.length) {
            insertsByIndex.set(candidate.index, candidate);
            if (isWatched) console.log(`[@${candidate.index}] INSERT OVERRIDE: longer content`);
          }
          continue;  // Don't process INSERT as a regular candidate
        }

        const existing = byIndex.get(candidate.index);

        if (candidate.action === "KEEP" && candidate.confidence < 5) {
          if (isWatched) console.log(`[@${candidate.index}] SKIP low-confidence KEEP (conf=${candidate.confidence})`);
          continue;
        }

        if (!existing) {
          byIndex.set(candidate.index, candidate);
          if (isWatched) console.log(`[@${candidate.index}] INITIAL: ${candidate.action} conf=${candidate.confidence}`);
        } else if ((candidate.action === "REPLACE" || candidate.action === "APPEND") && candidate.content) {
          // =================================================================
          // FIX: REPLACE/APPEND with content beats KEEP or DELETE
          // Also prefer longer content for same-action REPLACE
          // =================================================================
          const candidateLen = (candidate.content || "").length;
          const existingLen = (existing.content || "").length;
          const existingIsEmpty = existing.action === "KEEP" || existing.action === "DELETE";

          if (existingIsEmpty) {
            // Content beats no-content
            if (isWatched) {
              console.log(`[@${candidate.index}] OVERRIDE ${existing.action} with REPLACE (content beats no-content)`);
              console.log(`  New: "${candidate.content.slice(0, 50)}..."`);
            }
            byIndex.set(candidate.index, candidate);
          } else if (candidate.action === "REPLACE" && existing.action === "REPLACE") {
            // Both REPLACE - prefer substantially longer content
            if (candidateLen > existingLen * 1.5 && candidateLen > 100) {
              if (isWatched) {
                console.log(`[@${candidate.index}] OVERRIDE REPLACE: longer content (${candidateLen} > ${existingLen})`);
                console.log(`  Old: "${(existing.content || "").slice(0, 50)}..."`);
                console.log(`  New: "${candidate.content.slice(0, 50)}..."`);
              }
              byIndex.set(candidate.index, candidate);
            } else if (candidate.confidence > existing.confidence && candidateLen >= existingLen * 0.5) {
              if (isWatched) {
                console.log(`[@${candidate.index}] OVERRIDE REPLACE: higher conf AND not shorter`);
              }
              byIndex.set(candidate.index, candidate);
            } else if (isWatched) {
              console.log(`[@${candidate.index}] KEEP existing REPLACE: len=${existingLen} >= candidate len=${candidateLen}`);
            }
          } else if (candidate.confidence > existing.confidence) {
            if (isWatched) {
              console.log(`[@${candidate.index}] OVERRIDE: higher confidence`);
            }
            byIndex.set(candidate.index, candidate);
          } else if (isWatched) {
            console.log(`[@${candidate.index}] NO CHANGE: existing ${existing.action}(conf=${existing.confidence}) vs ${candidate.action}(conf=${candidate.confidence})`);
          }
          // If both are APPEND, combine
          if (existing.action === "APPEND" && candidate.action === "APPEND" && candidate.content) {
            const combined = {
              ...existing,
              content: existing.content + candidate.content,
              confidence: Math.max(existing.confidence, candidate.confidence),
            };
            byIndex.set(candidate.index, combined);
            if (isWatched) console.log(`[@${candidate.index}] COMBINE APPEND content`);
          }
        } else if (candidate.action === "DELETE" && existing.action === "KEEP") {
          if (isWatched) console.log(`[@${candidate.index}] OVERRIDE KEEP with DELETE`);
          byIndex.set(candidate.index, candidate);
        } else if (candidate.confidence > existing.confidence && candidate.action === existing.action) {
          if (isWatched) console.log(`[@${candidate.index}] UPGRADE same action: conf ${existing.confidence} -> ${candidate.confidence}`);
          byIndex.set(candidate.index, candidate);
        } else if (isWatched) {
          console.log(`[@${candidate.index}] NO CHANGE: existing ${existing.action}(conf=${existing.confidence}), candidate ${candidate.action}(conf=${candidate.confidence})`);
        }
      }
    }

    // ============================================================
    // DEBUG: Final decisions for WATCH blocks
    // ============================================================
    console.log("\n" + "=".repeat(80));
    console.log("=== FINAL DECISIONS FOR WATCH BLOCKS ===");
    console.log("=".repeat(80));
    for (const watchIdx of WATCH_BLOCKS) {
      const decision = byIndex.get(watchIdx);
      if (!decision) {
        console.log(`[@${watchIdx}] NO DECISION (will keep original)`);
      } else {
        const contentPreview = decision.content ? decision.content.slice(0, 100).replace(/\n/g, "\\n") : "null";
        console.log(`[@${watchIdx}] ${decision.action} conf=${decision.confidence}`);
        console.log(`  reasoning: "${(decision.reasoning || "none").slice(0, 100)}"`);
        console.log(`  content: "${contentPreview}${decision.content && decision.content.length > 100 ? "..." : ""}"`);
      }
    }

    const replacements = {};
    for (const [index, candidate] of byIndex) {
      if (candidate.action === "DELETE") {
        replacements[`@${index}`] = null;
      } else if (candidate.action === "REPLACE") {
        replacements[`@${index}`] = candidate.content;
      } else if (candidate.action === "APPEND") {
        const originalBlock = blocks.find((b) => b.index === index);
        const originalText = originalBlock ? originalBlock.text : "";
        replacements[`@${index}`] = originalText + candidate.content;
      }
    }

    // Add INSERT actions to replacements - these add content AFTER a block
    for (const [index, candidate] of insertsByIndex) {
      replacements[`INSERT@${index}`] = candidate.content;
      console.log(`[@${index}] INSERT added: "${candidate.content.slice(0, 80)}..."`);
    }

    // 7. Log replacement map
    console.log("\n" + "=".repeat(80));
    console.log("=== REPLACEMENT MAP (before final verification) ===");
    console.log("=".repeat(80));
    console.log(JSON.stringify(replacements, null, 2));

    // 7.5 FINAL VERIFICATION: Detect and remove duplicates
    console.log("\n" + "=".repeat(80));
    console.log("=== FINAL VERIFICATION: Checking for duplicates ===");
    console.log("=".repeat(80));

    // Generate text preview with indices
    const textPreviewLines = [];
    for (const block of blocks) {
      const key = `@${block.index}`;
      let content;
      if (key in replacements) {
        content = replacements[key];
      } else {
        content = block.text;
      }
      if (content !== null && content !== undefined) {
        textPreviewLines.push(`[${key}] ${content}`);
      }
    }
    const textPreview = textPreviewLines.join("\n\n");

    // Build compact replacement map for prompt
    const compactMap = {};
    for (const [key, value] of Object.entries(replacements)) {
      if (value === null) {
        compactMap[key] = "[DELETED]";
      } else if (value && value.length > 200) {
        compactMap[key] = value.slice(0, 200) + "...";
      } else {
        compactMap[key] = value;
      }
    }

    // Run final verification
    const finalVerifyPrompt = FINAL_VERIFICATION_PROMPT
      .replace("%REPLACEMENT_MAP%", JSON.stringify(compactMap, null, 2))
      .replace("%GENERATED_TEXT%", textPreview);

    let correctedReplacements = replacements;
    try {
      const verifyResponse = await runModel({
        model: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        messages: [{ role: "user", content: [{ text: finalVerifyPrompt }] }],
        system: "You are a document quality reviewer. Output only valid JSON.",
        thoughtBudget: 10000,
        stream: false,
      });

      // Parse response
      let jsonStr = verifyResponse.trim();
      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);

      const verifyResult = JSON.parse(jsonStr.trim());
      if (verifyResult && Array.isArray(verifyResult.corrections)) {
        console.log(`Final verification found ${verifyResult.corrections.length} corrections: ${verifyResult.summary}`);

        correctedReplacements = { ...replacements };
        for (const correction of verifyResult.corrections) {
          const key = `@${correction.index}`;
          if (correction.action === "DELETE") {
            correctedReplacements[key] = null;
            console.log(`  Correction: ${key} → DELETE (${correction.reason})`);
          } else if (correction.action === "REPLACE" && correction.content) {
            correctedReplacements[key] = correction.content;
            console.log(`  Correction: ${key} → REPLACE`);
          }
        }
      }
    } catch (verifyError) {
      console.warn("Final verification failed:", verifyError.message);
    }

    console.log("\n" + "=".repeat(80));
    console.log("=== REPLACEMENT MAP (after final verification) ===");
    console.log("=".repeat(80));
    console.log(JSON.stringify(correctedReplacements, null, 2));

    // 8. Apply replacements and extract text
    const outputBuffer = await docxReplace(templateBuffer, correctedReplacements);
    const { blocks: outputBlocks } = await docxExtractTextBlocks(outputBuffer);
    const outputText = outputBlocks.map((b) => b.text).join("\n");

    console.log("\n" + "=".repeat(80));
    console.log("=== GENERATED CONSENT TEXT ===");
    console.log("=".repeat(80));
    console.log(outputText);

    // 9. Stats
    const deleteCount = Object.values(correctedReplacements).filter((v) => v === null).length;
    const replaceCount = Object.keys(correctedReplacements).length - deleteCount;
    console.log("\n" + "=".repeat(80));
    console.log("=== STATS ===");
    console.log("=".repeat(80));
    console.log(`Deletions: ${deleteCount}`);
    console.log(`Replacements: ${replaceCount}`);
    console.log(`Total blocks: ${blocks.length}`);

    // 10. Log output blocks for manual comparison
    console.log("\n" + "=".repeat(80));
    console.log("=== OUTPUT BLOCKS (for manual comparison) ===");
    console.log("=".repeat(80));
    for (const block of outputBlocks) {
      console.log(`[@${block.index}] ${block.style}: ${block.text}`);
      console.log("---");
    }

    // ============================================================
    // PROBLEM ANALYSIS: Identify blocks that were deleted but shouldn't have been
    // ============================================================
    console.log("\n" + "=".repeat(80));
    console.log("=== PROBLEM ANALYSIS: Potentially wrong DELETE decisions ===");
    console.log("=".repeat(80));
    for (const watchIdx of WATCH_BLOCKS) {
      const decision = byIndex.get(watchIdx);
      if (decision && decision.action === "DELETE") {
        const originalBlock = blocks.find(b => b.index === watchIdx);
        if (originalBlock) {
          const hasContentInstruction = originalBlock.text.includes("[") ||
            originalBlock.text.toLowerCase().includes("describe") ||
            originalBlock.text.toLowerCase().includes("include");
          if (hasContentInstruction) {
            console.log(`\n[@${watchIdx}] POTENTIAL ISSUE: Deleted block that may need REPLACE`);
            console.log(`  Original text: "${originalBlock.text.slice(0, 150)}..."`);
            console.log(`  Reasoning: "${decision.reasoning || "none"}"`);

            // Show all candidates for this block
            const candidates = allCandidatesPerBlock.get(watchIdx) || [];
            console.log(`  All candidates (${candidates.length}):`);
            for (const { pChunk, tChunk, candidate } of candidates) {
              console.log(`    P${pChunk}×T${tChunk}: ${candidate.action} conf=${candidate.confidence}`);
            }
          }
        }
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("=== TEST COMPLETE ===");
    console.log("=".repeat(80));
  });
});
