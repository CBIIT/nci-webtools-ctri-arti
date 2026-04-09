import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let docxModule = null;

function getDocx() {
  if (!docxModule) {
    Object.defineProperty(globalThis, "localStorage", {
      value: globalThis.localStorage || {},
      configurable: true,
    });
    docxModule = require("docx");
  }
  return docxModule;
}

const HEADING_MAP = {
  1: "HEADING_1",
  2: "HEADING_2",
  3: "HEADING_3",
  4: "HEADING_4",
  5: "HEADING_5",
  6: "HEADING_6",
};

function parseInlineRuns(text) {
  const { TextRun } = getDocx();
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const [token] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) {
      runs.push(new TextRun(text.slice(lastIndex, index)));
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true }));
    } else if (token.startsWith("*") && token.endsWith("*")) {
      runs.push(new TextRun({ text: token.slice(1, -1), italics: true }));
    } else if (token.startsWith("`") && token.endsWith("`")) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: "Courier New" }));
    } else {
      runs.push(new TextRun(token));
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun(text.slice(lastIndex)));
  }

  return runs.length ? runs : [new TextRun("")];
}

function parseParagraphChildren(lines) {
  const { TextRun } = getDocx();
  const children = [];

  lines.forEach((line, index) => {
    if (index > 0) {
      children.push(new TextRun({ break: 1 }));
    }
    children.push(...parseInlineRuns(line));
  });

  return children.length ? children : [new TextRun("")];
}

function isBlank(line) {
  return !line || !line.trim();
}

function isRule(line) {
  return /^-{3,}\s*$/.test(line.trim());
}

function parseBlocks(markdown) {
  const blocks = [];
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    if (isRule(line)) {
      blocks.push({ type: "spacer" });
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const level = Math.floor((listMatch[1] || "").length / 2);
      const items = [];

      while (index < lines.length) {
        const currentMatch = lines[index].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!currentMatch) break;
        const currentOrdered = /\d+\./.test(currentMatch[2]);
        const currentLevel = Math.floor((currentMatch[1] || "").length / 2);
        if (ordered !== currentOrdered || level !== currentLevel) break;
        items.push(currentMatch[3].trim());
        index += 1;
      }

      blocks.push({
        type: ordered ? "ordered_list" : "unordered_list",
        level: Math.max(0, Math.min(level, 2)),
        items,
      });
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (
        isBlank(next) ||
        isRule(next) ||
        /^(#{1,6})\s+/.test(next) ||
        /^(\s*)([-*]|\d+\.)\s+/.test(next)
      ) {
        break;
      }
      paragraphLines.push(next.trim());
      index += 1;
    }

    blocks.push({ type: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function blockToParagraphs(block) {
  const { HeadingLevel, Paragraph } = getDocx();
  if (block.type === "spacer") {
    return [new Paragraph({ spacing: { after: 120 } })];
  }

  if (block.type === "heading") {
    return [
      new Paragraph({
        heading: HeadingLevel[HEADING_MAP[block.level]] || HeadingLevel.HEADING_3,
        spacing: { before: block.level === 1 ? 240 : 180, after: 120 },
        children: parseInlineRuns(block.text),
      }),
    ];
  }

  if (block.type === "paragraph") {
    return [
      new Paragraph({
        spacing: { after: 120 },
        children: parseParagraphChildren(block.lines || []),
      }),
    ];
  }

  if (block.type === "unordered_list") {
    return block.items.map(
      (item) =>
        new Paragraph({
          spacing: { after: 60 },
          numbering: { reference: "unordered-list", level: block.level },
          children: parseInlineRuns(item),
        })
    );
  }

  if (block.type === "ordered_list") {
    return block.items.map(
      (item) =>
        new Paragraph({
          spacing: { after: 60 },
          numbering: { reference: "ordered-list", level: block.level },
          children: parseInlineRuns(item),
        })
    );
  }

  return [];
}

export function markdownToDocxDocument(markdown, options = {}) {
  const { AlignmentType, Document } = getDocx();
  const children = parseBlocks(markdown).flatMap((block) => blockToParagraphs(block));

  return new Document({
    creator: "Protocol Advisor",
    title: options.title || "Protocol Advisor Report",
    description: options.title || "Protocol Advisor Report",
    numbering: {
      config: [
        {
          reference: "unordered-list",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: "bullet",
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: {
                  left: 720 + level * 360,
                  hanging: 360,
                },
              },
            },
          })),
        },
        {
          reference: "ordered-list",
          levels: [0, 1, 2].map((level) => ({
            level,
            format: "decimal",
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: {
                  left: 720 + level * 360,
                  hanging: 360,
                },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
}

export async function markdownToDocxBuffer(markdown, options = {}) {
  const { Packer } = getDocx();
  return Packer.toBuffer(markdownToDocxDocument(markdown, options));
}
