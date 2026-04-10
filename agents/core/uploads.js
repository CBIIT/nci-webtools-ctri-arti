import { MAX_INLINE_FILE_COUNT, getInlineFileError } from "gateway/core/upload-limits.js";
import logger from "shared/logger.js";
import { parseDocument } from "shared/parsers.js";

const FORMAT_TO_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const TEXT_FORMATS = new Set(["txt", "md", "csv", "html", "json", "xml"]);

async function extractContent(rawBytes, format) {
  if (TEXT_FORMATS.has(format)) {
    return { content: new TextDecoder().decode(rawBytes), encoding: "utf-8" };
  }

  const mime = FORMAT_TO_MIME[format];
  if (mime) {
    try {
      return { content: await parseDocument(rawBytes, mime), encoding: "utf-8" };
    } catch (error) {
      logger.warn(`Failed to parse ${format}:`, error.message);
    }
  }

  return { content: rawBytes.toString("base64"), encoding: "base64" };
}

function appendUploadedFilesTag(blocks, names) {
  if (!names.length) return;

  const tag = buildUploadedFilesNotice(names);
  const textBlock = [...blocks].reverse().find((block) => typeof block?.text === "string");
  if (textBlock) {
    textBlock.text += `\n\n${tag}`;
    return;
  }

  blocks.push({ text: tag });
}

function buildUploadedFilesNotice(names) {
  const files = names.join(", ");
  const examplePath = names[0];
  return [
    "<uploaded_files>",
    `These uploaded files were saved as conversation resources and are not attached inline: ${files}.`,
    `If the user asks about them, read them with the editor tool first using their filename, for example {"command":"view","path":"${examplePath}"}.`,
    "Do not say you have not read the file yet when it was just uploaded. Read it from resources with editor before answering.",
    "For the current turn's uploaded files, prefer editor over recall.",
    "</uploaded_files>",
  ].join("\n");
}

export async function processUploads(userMessage, { userId, agentId, conversationId, cms }) {
  const blocks = userMessage.content || [];
  const serverResourceOnlyNames = [];
  let inlineFileCount = 0;

  for (const block of blocks) {
    const file = block.document || block.image;
    if (!file?.source?.bytes) continue;

    const rawBytes =
      typeof file.source.bytes === "string"
        ? Buffer.from(file.source.bytes, "base64")
        : Buffer.from(file.source.bytes);

    const { content, encoding } = await extractContent(rawBytes, file.format);

    await cms.storeConversationResource(userId, {
      agentId,
      conversationId,
      name: file.originalName || file.name,
      type: block.document ? "document" : "image",
      content,
      metadata: { format: file.format, encoding },
    });

    let resourceOnly = !!file.resourceOnly;
    if (!resourceOnly) {
      if (inlineFileCount >= MAX_INLINE_FILE_COUNT) {
        resourceOnly = true;
      } else {
        const error = await getInlineFileError(file, rawBytes);
        resourceOnly = !!error;
      }
    }

    if (resourceOnly) {
      file.resourceOnly = true;
      serverResourceOnlyNames.push(file.originalName || file.name);
    } else {
      inlineFileCount += 1;
      file.source.bytes = rawBytes;
      delete file.resourceOnly;
    }
  }

  appendUploadedFilesTag(blocks, serverResourceOnlyNames);

  userMessage.content = blocks.filter((block) => {
    const file = block.document || block.image;
    if (!file?.source?.bytes) return true;
    if (file.resourceOnly) return false;
    delete file.resourceOnly;
    return true;
  });
}
