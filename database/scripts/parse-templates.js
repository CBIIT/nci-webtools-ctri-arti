/**
 * Parse DOCX template files into structured JSON with sections.
 *
 * Usage:
 *   node database/scripts/parse-templates.js
 *
 * Reads all .docx files from database/data/templates/
 * Outputs parsed JSON to database/data/templates/parsed/
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

import { convertToHtml } from "mammoth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../data/templates");
const OUTPUT_DIR = resolve(TEMPLATES_DIR, "parsed");

function stripHtmlTags(html) {
  return html.replace(/<[^>]+>/g, "").trim();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function htmlToPlainText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<\/tr>/gi, "\n")
      .replace(/<\/td>/gi, "\t")
      .replace(/<\/th>/gi, "\t")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function deriveTemplateName(filename) {
  return basename(filename, ".docx").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Fallback parser for templates that use bold labels instead of heading styles.
 * Matches patterns like: <p><strong>Label:</strong> content</p>
 * or standalone bold paragraphs as section dividers.
 */
function splitByBoldLabels(html) {
  // Match bold labels in paragraphs or list items, e.g.:
  //   <p><strong>Label:</strong>...</p>
  //   <li><strong>Label:</strong></li>
  const labelPattern = /<(?:p|li)[^>]*>\s*<strong>([^<]+?):?\s*<\/strong>/gi;
  const sections = [];
  const labels = [];
  let match;

  while ((match = labelPattern.exec(html)) !== null) {
    const title = stripHtmlTags(match[1]).replace(/:$/, "").trim();
    if (title.length < 2 || title === ".") continue;
    labels.push({ title, startIndex: match.index });
  }

  if (labels.length === 0) {
    return [{ level: 1, title: "Document", content: htmlToPlainText(html) }];
  }

  // Content before first label
  const preambleText = htmlToPlainText(html.substring(0, labels[0].startIndex));
  if (preambleText.length > 0) {
    sections.push({ level: 0, title: "Preamble", content: preambleText });
  }

  for (let i = 0; i < labels.length; i++) {
    const contentStart = labels[i].startIndex;
    const contentEnd = i + 1 < labels.length ? labels[i + 1].startIndex : html.length;
    const contentHtml = html.substring(contentStart, contentEnd);
    const content = htmlToPlainText(contentHtml);

    sections.push({
      level: 1,
      title: labels[i].title,
      content,
    });
  }

  return sections;
}

/**
 * Split HTML into sections based on heading tags.
 * Each section includes its heading level, title, and content until the next heading.
 */
function splitIntoSections(html) {
  const headingPattern = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  const sections = [];
  let match;

  // Collect all heading positions
  const headings = [];
  while ((match = headingPattern.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1], 10),
      titleHtml: match[2],
      title: stripHtmlTags(match[2]),
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  // Fallback: some templates use bold labels (e.g. "**Title:**") instead of heading styles
  if (headings.length === 0) {
    return splitByBoldLabels(html);
  }

  // Content before the first heading is preamble
  const preambleText = htmlToPlainText(html.substring(0, headings[0].startIndex));
  if (preambleText.length > 0) {
    sections.push({
      level: 0,
      title: "Preamble",
      content: preambleText,
    });
  }

  // Extract content between consecutive headings
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const contentStart = heading.endIndex;
    const contentEnd = i + 1 < headings.length ? headings[i + 1].startIndex : html.length;
    const contentHtml = html.substring(contentStart, contentEnd);
    const content = htmlToPlainText(contentHtml);

    sections.push({
      level: heading.level,
      title: heading.title,
      content,
    });
  }

  return sections;
}

async function parseTemplate(filePath) {
  const buffer = readFileSync(filePath);
  const result = await convertToHtml({ buffer });
  const filename = basename(filePath);
  const name = deriveTemplateName(filename);
  const sections = splitIntoSections(result.value);

  // Assign section numbers (skip empty sections)
  let sectionNumber = 0;
  const numberedSections = sections
    .filter(
      (section) => section.title.length > 0 && (section.content.length > 0 || section.level > 0)
    )
    .map((section) => ({
      sectionNumber: ++sectionNumber,
      level: section.level,
      title: section.title,
      content: section.content,
    }));

  return {
    name,
    description: `Protocol template: ${name}`,
    version: "1.0",
    sourceFile: filename,
    sections: numberedSections,
  };
}

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files = readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith(".docx"))
    .sort();

  console.log(`Found ${files.length} template files\n`);

  for (const file of files) {
    const filePath = resolve(TEMPLATES_DIR, file);

    try {
      const template = await parseTemplate(filePath);
      const outputName = basename(file, ".docx") + ".json";
      const outputPath = resolve(OUTPUT_DIR, outputName);

      writeFileSync(outputPath, JSON.stringify(template, null, 2) + "\n");

      const totalChars = template.sections.reduce((sum, s) => sum + s.content.length, 0);
      console.log(`${file}`);
      console.log(`  → ${template.sections.length} sections, ${totalChars.toLocaleString()} chars`);
      console.log(`  → ${outputPath}\n`);
    } catch (error) {
      console.error(`Failed to parse ${file}: ${error.message}`);
    }
  }

  console.log("Done.");
}

main();
