/**
 * Generate templates.csv and template-sections.csv from parsed JSON files.
 *
 * Usage:
 *   node database/scripts/generate-template-csvs.js
 *
 * Reads from: database/data/templates/parsed/*.json
 * Outputs to: database/data/templates.csv
 *             database/data/template-sections.csv
 */

import { readFileSync, readdirSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = resolve(__dirname, "../data/templates/parsed");
const DATA_DIR = resolve(__dirname, "../data");

function escapeCsvField(value) {
  if (value === null || value === undefined) return "null";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function toCsvRow(fields) {
  return fields.map(escapeCsvField).join(",");
}

const files = readdirSync(PARSED_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const templateRows = ["id,name,description,version,sourceFile"];
const sectionRows = ["id,templateID,sectionNumber,level,title,content"];

let templateId = 1;
let sectionId = 1;

for (const file of files) {
  const parsed = JSON.parse(readFileSync(resolve(PARSED_DIR, file), "utf-8"));

  templateRows.push(
    toCsvRow([templateId, parsed.name, parsed.description, parsed.version, parsed.sourceFile])
  );

  for (const section of parsed.sections) {
    sectionRows.push(
      toCsvRow([
        sectionId,
        templateId,
        section.sectionNumber,
        section.level,
        section.title,
        section.content,
      ])
    );
    sectionId++;
  }

  templateId++;
}

const templatesPath = resolve(DATA_DIR, "templates.csv");
const sectionsPath = resolve(DATA_DIR, "template-sections.csv");

writeFileSync(templatesPath, templateRows.join("\n") + "\n");
writeFileSync(sectionsPath, sectionRows.join("\n") + "\n");

console.log(`Generated ${templateId - 1} templates → ${templatesPath}`);
console.log(`Generated ${sectionId - 1} sections → ${sectionsPath}`);
