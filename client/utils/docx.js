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