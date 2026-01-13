import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  preserveOrder: true,
  parseTagValue: false,
  trimValues: false,
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: false,
  preserveOrder: true,
  suppressEmptyNode: true,
});

/**
 * Translate a DOCX file while preserving formatting using batch translation
 * @param {Buffer|Uint8Array|ArrayBuffer} docxBuffer - Input DOCX file
 * @param {Function} translateBatchFn - Function(texts: string[], options) => Promise<string[]>
 * @param {Object} options - Optional settings
 * @param {number} options.batchSize - Blocks per batch (default: 50)
 * @param {boolean} options.includeHeaders - Translate headers/footers (default: true)
 * @param {boolean} options.includeFootnotes - Translate footnotes/endnotes (default: true)
 * @param {boolean} options.includeComments - Translate comments (default: false)
 * @param {string} options.formality - 'formal' | 'informal' | null
 * @param {boolean} options.profanityMask - Replace profanity with "?$#@$"
 * @param {boolean} options.brevity - Use concise translations
 * @returns {Promise<Uint8Array>} Translated DOCX file
 */
export async function translateDocx(docxBuffer, translateBatchFn, options = {}) {
  const {
    includeHeaders = true,
    includeFootnotes = true,
    includeComments = false,
  } = options;

  // Load the DOCX file
  const zip = await JSZip.loadAsync(docxBuffer);

  // Collect XML parts to translate
  const parts = ['word/document.xml'];

  if (includeHeaders) {
    zip.forEach((path) => {
      if (/^word\/(header|footer)\d+\.xml$/.test(path)) {
        parts.push(path);
      }
    });
  }

  if (includeFootnotes) {
    if (zip.file('word/footnotes.xml')) parts.push('word/footnotes.xml');
    if (zip.file('word/endnotes.xml')) parts.push('word/endnotes.xml');
  }

  if (includeComments && zip.file('word/comments.xml')) {
    parts.push('word/comments.xml');
  }

  // Translate each part
  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlText = await file.async('string');
    const doc = xmlParser.parse(xmlText);

    await translateXmlDocBatched(doc, translateBatchFn, options);

    const newXml = xmlBuilder.build(doc);
    zip.file(path, newXml);
  }

  // Return the modified DOCX
  return await zip.generateAsync({ type: 'uint8array' });
}

/**
 * Translate text nodes in an XML document structure using batch processing
 * @param {Object} doc - Parsed XML document
 * @param {Function} translateBatchFn - Function(texts: string[], options) => Promise<string[]>
 * @param {Object} options - Translation options including batchSize
 */
async function translateXmlDocBatched(doc, translateBatchFn, options) {
  const { batchSize = 50 } = options;

  // Find all paragraphs (w:p) and table cells (w:tc) - these are our translation blocks
  const blocks = findBlocks(doc);

  // Step 1: Collect all block data upfront
  const blockData = [];
  for (const block of blocks) {
    const textNodes = collectTextNodes(block);
    if (textNodes.length === 0) continue;

    const originalText = textNodes.map((n) => n['#text'] || '').join('');
    if (!originalText.trim()) continue;

    blockData.push({ textNodes, originalText });
  }

  // Step 2: Process in batches
  for (let i = 0; i < blockData.length; i += batchSize) {
    const batch = blockData.slice(i, i + batchSize);
    const textsToTranslate = batch.map((b) => b.originalText);

    // Call batch translation (returns array in same order)
    const translations = await translateBatchFn(textsToTranslate, options);

    // Step 3: Apply translations back to nodes
    for (let j = 0; j < batch.length; j++) {
      distributeText(batch[j].textNodes, translations[j]);
    }
  }
}

/**
 * Find all block-level elements (paragraphs and table cells)
 */
function findBlocks(node, blocks = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      if (typeof item === 'object' && item !== null) {
        const tagName = Object.keys(item).find(k => k.startsWith('w:'));
        if (tagName === 'w:p' || tagName === 'w:tc' || tagName === 'w:txbxContent') {
          blocks.push(item);
        } else {
          findBlocks(item, blocks);
        }
      }
    }
  } else if (typeof node === 'object' && node !== null) {
    for (const key in node) {
      if (key === 'w:p' || key === 'w:tc' || key === 'w:txbxContent') {
        blocks.push(node);
      } else {
        findBlocks(node[key], blocks);
      }
    }
  }
  return blocks;
}

/**
 * Collect all w:t text nodes from a block, skipping field codes
 */
function collectTextNodes(block, nodes = [], inField = false) {
  if (Array.isArray(block)) {
    for (const item of block) {
      collectTextNodes(item, nodes, inField);
    }
  } else if (typeof block === 'object' && block !== null) {
    for (const key in block) {
      // Skip field instructions, math, and other non-translatable content
      if (key === 'w:instrText' || key === 'w:fldSimple' || key.startsWith('m:')) {
        continue;
      }

      if (key === 'w:t') {
        // Found a text node
        const textNode = Array.isArray(block[key]) ? block[key][0] : block[key];
        if (textNode && typeof textNode === 'object' && '#text' in textNode) {
          nodes.push(textNode);
        }
      } else {
        collectTextNodes(block[key], nodes, inField);
      }
    }
  }
  return nodes;
}

/**
 * Extract text from a paragraph, converting w:br elements to newlines
 * This is for text extraction (read-only), not for modification
 */
function extractParagraphText(block) {
  const parts = [];

  function walk(node, inField = false) {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, inField);
      }
    } else if (typeof node === 'object' && node !== null) {
      // Check for field char markers
      if ('w:fldChar' in node) {
        const type = node['w:fldChar']?.[0]?.[':@']?.['@_w:fldCharType'] ||
                    node[':@']?.['@_w:fldCharType'];
        if (type === 'begin') inField = true;
        if (type === 'end') inField = false;
        return;
      }

      // Skip field content
      if (inField) return;

      for (const key in node) {
        // Skip field instructions and math
        if (key === 'w:instrText' || key === 'w:fldSimple' || key.startsWith('m:')) {
          continue;
        }

        if (key === 'w:br') {
          // Line break element - convert to newline
          parts.push('\n');
        } else if (key === 'w:t') {
          // Text element
          const textNode = Array.isArray(node[key]) ? node[key][0] : node[key];
          if (textNode && typeof textNode === 'object' && '#text' in textNode) {
            parts.push(textNode['#text'] || '');
          }
        } else if (key !== ':@' && key !== '#text') {
          walk(node[key], inField);
        }
      }
    }
  }

  walk(block);
  return parts.join('');
}

/**
 * Collect text nodes with their parent run context (for inserting line breaks)
 * @returns {Array<{textNode: Object, parentRun: Array, indexInRun: number}>}
 */
function collectTextNodesWithContext(block, results = [], currentRun = null, runContent = null) {
  if (Array.isArray(block)) {
    for (let i = 0; i < block.length; i++) {
      const item = block[i];
      if (typeof item === 'object' && item !== null) {
        // Check if this item is a w:r (run) element
        if ('w:r' in item) {
          collectTextNodesWithContext(item['w:r'], results, item, item['w:r']);
        } else if ('w:t' in item && currentRun) {
          // Found a text element inside a run
          const textNode = Array.isArray(item['w:t']) ? item['w:t'][0] : item['w:t'];
          if (textNode && typeof textNode === 'object' && '#text' in textNode) {
            results.push({
              textNode,
              parentRun: currentRun,
              runContent: runContent,
              tElement: item,
              indexInRun: i
            });
          }
        } else {
          collectTextNodesWithContext(item, results, currentRun, runContent);
        }
      }
    }
  } else if (typeof block === 'object' && block !== null) {
    for (const key in block) {
      if (key === 'w:instrText' || key === 'w:fldSimple' || key.startsWith('m:')) {
        continue;
      }
      if (key === 'w:r') {
        collectTextNodesWithContext(block[key], results, block, block[key]);
      } else if (key === 'w:t' && currentRun) {
        const textNode = Array.isArray(block[key]) ? block[key][0] : block[key];
        if (textNode && typeof textNode === 'object' && '#text' in textNode) {
          // Find index in runContent
          const idx = runContent ? runContent.findIndex(item => item === block || ('w:t' in item && item['w:t'] === block[key])) : -1;
          results.push({
            textNode,
            parentRun: currentRun,
            runContent: runContent,
            tElement: block,
            indexInRun: idx
          });
        }
      } else {
        collectTextNodesWithContext(block[key], results, currentRun, runContent);
      }
    }
  }
  return results;
}

/**
 * Insert text with line breaks into a run by creating multiple w:t elements with w:br between them
 * @param {Array} runContent - The w:r element's content array
 * @param {number} tIndex - Index of the w:t element to replace
 * @param {string} text - Text that may contain \n characters
 */
function insertTextWithLineBreaks(runContent, tIndex, text) {
  if (tIndex < 0 || !runContent || !Array.isArray(runContent)) {
    return;
  }

  const lines = text.split('\n');
  if (lines.length === 1) {
    // No line breaks, just update the text
    const tElement = runContent[tIndex];
    if (tElement && 'w:t' in tElement) {
      const textNode = Array.isArray(tElement['w:t']) ? tElement['w:t'][0] : tElement['w:t'];
      if (textNode) {
        textNode['#text'] = text;
      }
    }
    return;
  }

  // Build new elements: w:t, w:br, w:t, w:br, w:t...
  const newElements = [];
  for (let i = 0; i < lines.length; i++) {
    // Add text element
    newElements.push({
      'w:t': [{
        '#text': lines[i],
        ':@': { '@_xml:space': 'preserve' }
      }]
    });
    // Add line break (except after last line)
    if (i < lines.length - 1) {
      newElements.push({ 'w:br': [] });
    }
  }

  // Replace the original w:t element with the new elements
  runContent.splice(tIndex, 1, ...newElements);
}

/**
 * Distribute translated text across original text nodes proportionally
 */
function distributeText(textNodes, translated) {
  if (textNodes.length === 0) return;

  // Calculate original lengths
  const lengths = textNodes.map(n => (n['#text'] || '').length);
  const totalOriginal = lengths.reduce((a, b) => a + b, 0);

  if (totalOriginal === 0) {
    // All empty, put everything in first node
    textNodes[0]['#text'] = translated;
    return;
  }

  // If translation is similar length, distribute proportionally
  if (Math.abs(translated.length - totalOriginal) < totalOriginal * 0.5) {
    let cursor = 0;
    for (let i = 0; i < textNodes.length; i++) {
      const proportion = lengths[i] / totalOriginal;
      const targetLength = Math.round(translated.length * proportion);
      const slice = translated.slice(cursor, cursor + targetLength);
      textNodes[i]['#text'] = slice;
      cursor += targetLength;
    }
    // Put any remainder in last node
    if (cursor < translated.length) {
      textNodes[textNodes.length - 1]['#text'] += translated.slice(cursor);
    }
  } else {
    // Length changed significantly, put everything in first node, clear others
    textNodes[0]['#text'] = translated;
    for (let i = 1; i < textNodes.length; i++) {
      textNodes[i]['#text'] = '';
    }
  }
}

/**
 * Extract text from a DOCX file
 * Uses the same text extraction as docxReplace for consistency
 * @param {Buffer|Uint8Array|ArrayBuffer} docxBuffer - Input DOCX file
 * @param {Object} options - Optional settings
 * @param {boolean} options.includeHeaders - Include headers/footers (default: true)
 * @param {boolean} options.includeFootnotes - Include footnotes/endnotes (default: true)
 * @returns {Promise<string>} Extracted text
 */
export async function docxExtractText(docxBuffer, options = {}) {
  const {
    includeHeaders = true,
    includeFootnotes = true,
  } = options;

  // Load the DOCX file
  const zip = await JSZip.loadAsync(docxBuffer);

  // Collect XML parts to process
  const parts = ['word/document.xml'];

  if (includeHeaders) {
    zip.forEach((path) => {
      if (/^word\/(header|footer)\d+\.xml$/.test(path)) {
        parts.push(path);
      }
    });
  }

  if (includeFootnotes) {
    if (zip.file('word/footnotes.xml')) parts.push('word/footnotes.xml');
    if (zip.file('word/endnotes.xml')) parts.push('word/endnotes.xml');
  }

  // Extract text from each part
  const textParts = [];
  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlText = await file.async('string');
    const doc = xmlParser.parse(xmlText);

    const paragraphs = findParagraphs(doc);
    const { combinedText } = buildNormalizedCombinedText(paragraphs);
    if (combinedText.trim()) {
      textParts.push(combinedText);
    }
  }

  return textParts.join('\n\n');
}

/**
 * Replace text strings in a DOCX document
 * @param {Buffer|Uint8Array|ArrayBuffer} docxBuffer - Input DOCX file
 * @param {Object} replacements - Map of {"original text": "replacement text"}
 * @param {Object} options - Optional settings
 * @param {boolean} options.includeHeaders - Process headers/footers (default: true)
 * @param {boolean} options.includeFootnotes - Process footnotes/endnotes (default: true)
 * @returns {Promise<Uint8Array>} Modified DOCX file
 */
export async function docxReplace(docxBuffer, replacements, options = {}) {
  const {
    includeHeaders = true,
    includeFootnotes = true,
  } = options;

  // Load the DOCX file
  const zip = await JSZip.loadAsync(docxBuffer);

  // Collect XML parts to process
  const parts = ['word/document.xml'];

  if (includeHeaders) {
    zip.forEach((path) => {
      if (/^word\/(header|footer)\d+\.xml$/.test(path)) {
        parts.push(path);
      }
    });
  }

  if (includeFootnotes) {
    if (zip.file('word/footnotes.xml')) parts.push('word/footnotes.xml');
    if (zip.file('word/endnotes.xml')) parts.push('word/endnotes.xml');
  }

  // Process each part
  for (const path of parts) {
    const file = zip.file(path);
    if (!file) continue;

    const xmlText = await file.async('string');
    const doc = xmlParser.parse(xmlText);

    replaceXmlDocText(doc, replacements);

    const newXml = xmlBuilder.build(doc);
    zip.file(path, newXml);
  }

  // Return the modified DOCX
  return await zip.generateAsync({ type: 'uint8array' });
}

/**
 * Find all paragraph elements (w:p) in document order
 * @returns {Array<{element: Object, parent: Array, index: number}>}
 */
function findParagraphs(node, results = [], parent = null, index = -1) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      if (typeof item === 'object' && item !== null) {
        if ('w:p' in item) {
          results.push({ element: item, parent: node, index: i });
        }
        findParagraphs(item, results, node, i);
      }
    }
  } else if (typeof node === 'object' && node !== null) {
    for (const key in node) {
      if (key === 'w:p') {
        // This is the paragraph content itself, parent object contains it
        // Already handled above
      }
      findParagraphs(node[key], results, null, -1);
    }
  }
  return results;
}

/**
 * Build combined text from paragraphs (like mammoth.extractRawText)
 * Returns the combined text and offset mapping for each paragraph
 * @param {boolean} normalized - If true, skip empty paragraphs for offset calculation (matches normalized text)
 */
function buildCombinedText(paragraphs, normalized = false) {
  const paragraphData = [];
  let offset = 0;
  let prevWasEmpty = false;

  for (const p of paragraphs) {
    const textNodes = collectTextNodes(p.element);
    const text = textNodes.map(n => n['#text'] || '').join('');

    const isEmpty = text.length === 0;

    // For normalized mode, consecutive empty paragraphs don't add to offset
    // (they get collapsed to a single \n)
    const skipOffset = normalized && isEmpty && prevWasEmpty;

    paragraphData.push({
      ...p,
      textNodes,
      text,
      startOffset: offset,
      endOffset: offset + text.length
    });

    if (!skipOffset) {
      offset += text.length + 1; // +1 for the \n separator
    }
    prevWasEmpty = isEmpty;
  }

  const combinedText = paragraphData.map(p => p.text).join('\n');
  return { combinedText, paragraphData };
}

/**
 * Build normalized combined text where consecutive empty paragraphs are collapsed
 * Computes offsets by building the text incrementally, so offsets match actual positions
 * Uses extractParagraphText to properly handle w:br elements as newlines
 */
function buildNormalizedCombinedText(paragraphs) {
  const paragraphData = [];

  // First, collect text from all paragraphs using extractParagraphText
  // which properly converts w:br to \n
  for (const p of paragraphs) {
    const textNodes = collectTextNodes(p.element);
    const text = extractParagraphText(p.element);
    paragraphData.push({
      ...p,
      textNodes,
      text,
      startOffset: 0,  // Will be calculated below
      endOffset: 0
    });
  }

  // Build combined text incrementally, tracking where each paragraph's content lands
  let combinedText = '';
  let needsSeparator = false;

  for (const p of paragraphData) {
    if (p.text.length > 0) {
      // Non-empty paragraph: add separator if needed, then add text
      if (needsSeparator) {
        combinedText += '\n';
      }
      p.startOffset = combinedText.length;
      combinedText += p.text;
      p.endOffset = combinedText.length;
      needsSeparator = true;
    } else {
      // Empty paragraph: exists at current position but contributes no text
      // Don't add separator or change needsSeparator (consecutive empties collapse)
      p.startOffset = combinedText.length;
      p.endOffset = combinedText.length;
    }
  }

  return { combinedText, paragraphData };
}

/**
 * Find which paragraphs a match spans based on character offsets
 */
function findAffectedParagraphs(matchStart, matchEnd, paragraphData) {
  const affected = [];
  for (let i = 0; i < paragraphData.length; i++) {
    const p = paragraphData[i];
    // Check if this paragraph overlaps with the match range
    // Account for \n separators: paragraph i ends at endOffset, then \n, then paragraph i+1 starts
    const pStart = p.startOffset;
    const pEnd = p.endOffset;

    if (matchEnd > pStart && matchStart < pEnd) {
      affected.push({ ...p, paragraphIndex: i });
    } else if (i > 0) {
      // Check if match includes the \n between paragraphs
      const prevEnd = paragraphData[i - 1].endOffset;
      const newlinePos = prevEnd; // The \n is at position prevEnd in combined text
      if (matchStart <= newlinePos && matchEnd > newlinePos && matchEnd > pStart) {
        affected.push({ ...p, paragraphIndex: i });
      }
    }
  }
  return affected;
}

/**
 * Apply text with line breaks to a paragraph's text nodes
 * Handles \n by inserting <w:br/> elements
 */
function applyTextToParagraph(paragraph, newText) {
  const textNodesWithCtx = collectTextNodesWithContext(paragraph.element);

  if (textNodesWithCtx.length === 0) {
    return;
  }

  // Check if newText contains line breaks
  if (newText.includes('\n')) {
    // Put all text in first node's run, with <w:br/> for line breaks
    const firstCtx = textNodesWithCtx[0];
    if (firstCtx.runContent && firstCtx.indexInRun >= 0) {
      insertTextWithLineBreaks(firstCtx.runContent, firstCtx.indexInRun, newText);
    } else {
      // Fallback: just set the text (won't render \n correctly)
      firstCtx.textNode['#text'] = newText;
    }

    // Clear other text nodes
    for (let i = 1; i < textNodesWithCtx.length; i++) {
      textNodesWithCtx[i].textNode['#text'] = '';
    }
  } else {
    // No line breaks, use simple distribution
    const textNodes = textNodesWithCtx.map(ctx => ctx.textNode);
    distributeText(textNodes, newText);
  }
}

/**
 * Merge multiple paragraphs into one (for cross-paragraph replacements)
 * Keeps first paragraph, removes others, combines their text with <w:br/>
 */
function mergeParagraphs(affectedParagraphs, newText, paragraphData) {
  if (affectedParagraphs.length === 0) return;

  const firstPara = affectedParagraphs[0];

  // Apply the new text to the first paragraph
  applyTextToParagraph(firstPara, newText);

  // Remove subsequent paragraphs from their parents
  for (let i = 1; i < affectedParagraphs.length; i++) {
    const p = affectedParagraphs[i];
    if (p.parent && Array.isArray(p.parent) && p.index >= 0) {
      // Find and remove this paragraph from parent
      const idx = p.parent.indexOf(p.element);
      if (idx >= 0) {
        p.parent.splice(idx, 1);
      }
    }
  }
}

/**
 * Normalize text for matching: collapse multiple newlines and surrounding whitespace
 * This handles the difference between mammoth (uses \n\n between paragraphs) and our combined text (\n)
 * Also handles patterns like \n\n \n\n (newlines with spaces between)
 * Also removes tabs since mammoth renders tables with tabs but our extraction doesn't
 */
function normalizeForMatching(text) {
  // First, collapse sequences of whitespace containing newlines into single \n
  // This handles \n\n, \n \n, \n\n \n\n, etc.
  let result = text.replace(/[\s]*\n[\s\n]*/g, '\n');
  // Remove tabs (mammoth uses tabs in tables, but our extraction doesn't)
  result = result.replace(/\t+/g, '');
  return result;
}

/**
 * Replace text in XML document using mammoth-style combined text matching
 * @param {Object} doc - Parsed XML document
 * @param {Object} replacements - Map of {"original text": "replacement text"} or {"key": ["val1", "val2"]}
 */
function replaceXmlDocText(doc, replacements) {
  const occurrenceCounts = {};

  // Build mammoth-style combined text view
  const paragraphs = findParagraphs(doc);
  if (paragraphs.length === 0) return;

  let { combinedText, paragraphData } = buildCombinedText(paragraphs);

  // Check if any replacement keys contain \n (cross-paragraph patterns)
  const hasMultiLineKeys = Object.keys(replacements).some(k => k.includes('\n'));

  if (hasMultiLineKeys) {
    // Process multi-line patterns first (these may modify document structure)
    // Build normalized combined text with matching offsets
    let normalizedResult = buildNormalizedCombinedText(paragraphs);
    let normalizedCombined = normalizedResult.combinedText;
    let normalizedParagraphData = normalizedResult.paragraphData;

    for (const [find, replace] of Object.entries(replacements)) {
      if (!find.includes('\n')) continue;

      // Normalize search key too (mammoth uses \n\n, we use \n)
      const normalizedFind = normalizeForMatching(find);

      let searchStart = 0;
      let matchIndex;

      while ((matchIndex = normalizedCombined.indexOf(normalizedFind, searchStart)) !== -1) {
        const matchEnd = matchIndex + normalizedFind.length;
        const affected = findAffectedParagraphs(matchIndex, matchEnd, normalizedParagraphData);

        if (affected.length > 0) {
          // Get replacement value (handle arrays)
          let replaceValue;
          if (Array.isArray(replace)) {
            const count = occurrenceCounts[find] || 0;
            replaceValue = replace[Math.min(count, replace.length - 1)];
            occurrenceCounts[find] = count + 1;
          } else {
            replaceValue = replace;
          }

          // Merge paragraphs and apply replacement
          mergeParagraphs(affected, replaceValue, normalizedParagraphData);

          // Rebuild combined text after modification
          const newParagraphs = findParagraphs(doc);
          normalizedResult = buildNormalizedCombinedText(newParagraphs);
          normalizedCombined = normalizedResult.combinedText;
          normalizedParagraphData = normalizedResult.paragraphData;

          // Continue searching from beginning (structure changed)
          searchStart = 0;
        } else {
          searchStart = matchEnd;
        }
      }
    }
  }

  // Process single-line patterns (paragraph by paragraph)
  // Rebuild paragraph data in case structure changed
  const finalParagraphs = findParagraphs(doc);
  for (const p of finalParagraphs) {
    const textNodes = collectTextNodes(p.element);
    if (textNodes.length === 0) continue;

    const originalText = textNodes.map(n => n['#text'] || '').join('');
    if (!originalText) continue;

    // Apply single-line replacements only
    const singleLineReplacements = {};
    for (const [find, replace] of Object.entries(replacements)) {
      if (!find.includes('\n')) {
        singleLineReplacements[find] = replace;
      }
    }

    const replacedText = replaceAllText(originalText, singleLineReplacements, occurrenceCounts);

    if (replacedText !== originalText) {
      // Use applyTextToParagraph to handle line breaks in replacement
      const pData = { element: p.element, textNodes };
      applyTextToParagraph(pData, replacedText);
    }
  }
}

/**
 * Apply multiple string replacements to text
 * @param {string} text - Original text
 * @param {Object} replacements - Map of {"find": "replace"} or {"find": ["replace1", "replace2"]}
 * @param {Object} occurrenceCounts - Tracks occurrence count per key for array replacements
 * @returns {string} Text with all replacements applied
 */
function replaceAllText(text, replacements, occurrenceCounts = {}) {
  let result = text;
  for (const [find, replace] of Object.entries(replacements)) {
    if (Array.isArray(replace)) {
      // Handle array: each occurrence gets next item, use last item if exhausted
      let searchStart = 0;
      let output = '';
      let idx;
      while ((idx = result.indexOf(find, searchStart)) !== -1) {
        output += result.slice(searchStart, idx);
        const count = occurrenceCounts[find] || 0;
        const replaceValue = replace[Math.min(count, replace.length - 1)];
        output += replaceValue;
        occurrenceCounts[find] = count + 1;
        searchStart = idx + find.length;
      }
      output += result.slice(searchStart);
      result = output;
    } else {
      result = result.split(find).join(replace);
    }
  }
  return result;
}