# Consent Crafter v2 - Debug Notes

## Test Run: 2024-02-04

### Issues Identified

#### 1. MERGE LOGIC BUG: Higher confidence wins even with less content

**Example: Block 68 (WHAT WILL HAPPEN procedures)**
- `P0×T0`: REPLACE conf=9 → Full procedure list with screening, treatment schedule, etc.
- `P13×T0`: REPLACE conf=10 → Just intro sentence "If you decide to take part in this study, you will be asked to:"
- **Winner**: conf=10 with no content!

**Root Cause**: The merge logic uses confidence as the sole tie-breaker:
```javascript
if (candidate.confidence > existing.confidence) {
  byIndex.set(candidate.index, candidate);
}
```

**Fix Needed**: When both are REPLACE, prefer longer/more substantial content:
```javascript
if (candidate.action === "REPLACE" && existing.action === "REPLACE") {
  // Prefer content length/quality over raw confidence
  const candidateLen = (candidate.content || "").length;
  const existingLen = (existing.content || "").length;
  if (candidateLen > existingLen * 1.5 || candidate.confidence > existing.confidence + 2) {
    byIndex.set(candidate.index, candidate);
  }
}
```

#### 2. MERGE LOGIC BUG: DELETE can win over REPLACE due to processing order

**Example: Block 92 (multi-site language)**
- `P0×T0`: REPLACE conf=9 → "Additional people might also participate at University of Chicago."
- `P6×T0`: DELETE conf=10

If DELETE processes first, REPLACE doesn't overwrite it because:
- `existing.action === "KEEP"` → FALSE (it's DELETE)
- `candidate.confidence > existing.confidence` → 9 > 10 → FALSE

**Fix Needed**: REPLACE with content should ALWAYS beat DELETE:
```javascript
} else if ((candidate.action === "REPLACE" || candidate.action === "APPEND") && candidate.content) {
  // REPLACE/APPEND with content should beat DELETE or KEEP
  if (existing.action === "KEEP" || existing.action === "DELETE" || candidate.confidence > existing.confidence) {
    byIndex.set(candidate.index, candidate);
  }
}
```

#### 3. PROTOCOL CHUNK ISSUE: Wrong chunk has higher confidence

Protocol chunks without relevant info return REPLACE with empty/minimal content but high confidence because they correctly identify the block as "instruction that needs content".

**Fix Options**:
1. Adjust prompt: "If you don't have the relevant info in this excerpt, return KEEP with low confidence to defer to other chunks"
2. Post-processing: Filter out REPLACE responses with suspiciously short content
3. Content-aware merge: Prefer responses with more substantial content

### User Suggestion: Section-based Template Chunking

Instead of arbitrary boundaries (every N blocks), chunk at section headers (Heading1):
- Keeps sections intact
- Preserves context for each section
- Avoids splitting instruction blocks across chunks

**Implementation**:
```javascript
function chunkTemplateBySection(blocks, maxBlocksPerChunk = 100) {
  const chunks = [];
  let currentChunk = { blocks: [], sections: [] };
  let currentSection = null;

  for (const block of blocks) {
    if (isHeading1(block)) {
      // Start new section
      if (currentSection && currentChunk.blocks.length > 0) {
        // Check if adding this section would exceed limit
        if (currentChunk.blocks.length > maxBlocksPerChunk * 0.8) {
          chunks.push(currentChunk);
          currentChunk = { blocks: [], sections: [] };
        }
      }
      currentSection = block.text;
      currentChunk.sections.push(currentSection);
    }
    currentChunk.blocks.push(block);
  }

  if (currentChunk.blocks.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}
```

### Files to Modify

1. `client/pages/tools/consent-crafter-v2/index.js`:
   - Fix merge logic in `runBlockBasedGeneration`
   - Implement section-based template chunking
   - Adjust prompt to handle missing info better

2. `client/test/pages/tools/consent-crafter-v2/index.test.js`:
   - Already has comprehensive logging
   - Update WATCH_BLOCKS as issues are fixed

### Next Steps

1. [ ] Fix merge logic: REPLACE with content beats DELETE
2. [ ] Fix merge logic: Prefer longer content for same-action REPLACE
3. [ ] Implement section-based template chunking
4. [ ] Adjust prompt for chunks without relevant info
5. [ ] Re-run test and compare results
6. [ ] Add follow-up message asking model to double-check (user's suggestion)

### Test Output Location

Full debug output saved to: `integration-test-debug-20260204.txt`
