import { parseDocument } from "shared/parsers.js";

import { getToolSpecs } from "./tool-specs.js";
import { getToolFn } from "./tools.js";

/**
 * Core agent loop — async generator that yields NDJSON events.
 *
 * Streams inference chunks back to the caller, executes tools server-side,
 * and persists messages during the loop (partial history survives crashes).
 *
 * @param {Object} params
 * @param {number} params.userId
 * @param {number} params.agentId
 * @param {number} params.conversationId - conversation ID
 * @param {Object} params.userMessage - { role: "user", content: [...] }
 * @param {string} params.model - model ID
 * @param {number} params.thoughtBudget - 0 for no reasoning, >0 for extended thinking
 * @param {Object} params.gateway - gateway client { invoke }
 * @param {Object} params.cms - CMS client
 */
export async function* runAgentLoop({
  userId,
  agentId,
  conversationId,
  userMessage,
  model,
  thoughtBudget = 0,
  gateway,
  cms,
}) {
  // 1. Load agent config
  const agent = await cms.getAgent(userId, agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  const toolNames = agent.tools || ["search", "browse", "data", "editor", "think"];
  const toolSpecs = getToolSpecs(toolNames);
  const tools = toolSpecs.map(({ toolSpec }) => ({ toolSpec }));

  // 2. Load conversation context (compressed messages)
  const context = await cms.getContext(userId, conversationId, { compressed: true });
  const existingMessages = context?.messages || [];

  // 3. Process uploaded files → resources, then build clean message for model
  await processUploads(userMessage, { userId, agentId, conversationId, cms });

  // Persist the cleaned message (no base64 blobs, no resourceOnly flags)
  await cms.addMessage(userId, conversationId, userMessage);

  // Build full message list for inference
  const messages = [...existingMessages, userMessage];

  // 4. Build system prompt
  const time = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Load agent-scoped resources (no conversationID) — user's persistent memory
  const resources = await cms.getResourcesByAgent(userId, agentId);
  const agentResources = resources.filter((r) => !r.conversationID);

  // Inject memory file contents + skill filenames into system prompt
  const memoryFiles = agentResources.filter((r) => r.name.startsWith("memories/") && r.content);
  const skillFiles = agentResources.filter((r) => r.name.startsWith("skills/"));

  const memoryContent = [
    ...memoryFiles.map((r) => `<file name="${r.name}">${r.content}</file>`),
    skillFiles.length ? `<skills>\n${skillFiles.map((r) => r.name).join("\n")}\n</skills>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let system;
  if (agent.systemPrompt) {
    system = agent.systemPrompt
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{memory\}\}/g, memoryContent);
  } else {
    system = getDefaultSystemPrompt(time, memoryContent);
  }

  // Tool execution context
  const toolContext = { userId, agentId, conversationId, gateway, cms };

  // 5. Agent loop
  let done = false;
  while (!done) {
    // Invoke model (streaming)
    const result = await gateway.invoke({
      userID: userId,
      model,
      messages,
      system,
      tools,
      thoughtBudget,
      stream: true,
      type: agent.name || "agent",
    });

    if (result.status === 429) {
      yield { agentError: { message: result.error } };
      return;
    }

    // Accumulate assistant message content blocks
    const assistantContent = [];
    let stopReason = null;

    for await (const chunk of result.stream) {
      // Forward stream chunk to client
      yield chunk;

      // Accumulate content blocks
      accumulateContent(assistantContent, chunk);

      if (chunk.messageStop) {
        stopReason = chunk.messageStop.stopReason;
      }
    }

    // Parse any accumulated tool use JSON
    for (const block of assistantContent) {
      if (block.toolUse && typeof block.toolUse.input === "string") {
        try {
          block.toolUse.input = JSON.parse(block.toolUse.input);
        } catch {
          // Leave as string if not valid JSON
        }
      }
    }

    // Build and persist assistant message
    const assistantMessage = { role: "assistant", content: assistantContent };
    await cms.addMessage(userId, conversationId, assistantMessage);
    messages.push(assistantMessage);

    if (stopReason === "end_turn" || !stopReason) {
      done = true;
    } else if (stopReason === "tool_use") {
      const toolUses = assistantContent.filter((b) => b.toolUse).map((b) => b.toolUse);

      // Check if any tools need client-side execution
      const hasClientTools = toolUses.some((tu) => !getToolFn(tu.name));

      if (hasClientTools) {
        // Yield client tool requests and end the server loop —
        // the client will execute these tools and POST back with results
        for (const tu of toolUses) {
          if (!getToolFn(tu.name)) {
            yield {
              clientToolRequest: { toolUseId: tu.toolUseId, name: tu.name, input: tu.input },
            };
          }
        }
        // Execute any server-side tools in this batch and yield their results
        for (const tu of toolUses) {
          const fn = getToolFn(tu.name);
          if (fn) {
            try {
              const result = await fn(tu.input, toolContext);
              yield {
                toolResult: {
                  toolUseId: tu.toolUseId,
                  content: [{ json: { results: result } }],
                },
              };
            } catch (error) {
              yield {
                toolResult: {
                  toolUseId: tu.toolUseId,
                  content: [{ json: { error: error.stack || error.message || String(error) } }],
                },
              };
            }
          }
        }
        // Stop the server loop — client takes over for client-only tools
        done = true;
      } else {
        // All tools are server-side — execute and continue the loop
        const toolResultContent = [];

        for (const tu of toolUses) {
          const fn = getToolFn(tu.name);
          let toolResult;

          try {
            const result = await fn(tu.input, toolContext);
            toolResult = {
              toolResult: {
                toolUseId: tu.toolUseId,
                content: [{ json: { results: result } }],
              },
            };
          } catch (error) {
            const errorResult = error.stack || error.message || String(error);
            toolResult = {
              toolResult: {
                toolUseId: tu.toolUseId,
                content: [{ json: { error: errorResult } }],
              },
            };
          }

          yield toolResult;
          toolResultContent.push(toolResult);
        }

        // Persist tool results message
        const toolResultsMessage = { role: "user", content: toolResultContent };
        await cms.addMessage(userId, conversationId, toolResultsMessage);
        messages.push(toolResultsMessage);
      }
    }
  }
}

/**
 * Accumulate streaming content blocks into an array
 */
function accumulateContent(content, chunk) {
  const { contentBlockStart, contentBlockDelta, contentBlockStop } = chunk;

  if (contentBlockStart) {
    const { contentBlockIndex, start } = contentBlockStart;
    if (start?.toolUse) {
      content[contentBlockIndex] = { toolUse: { ...start.toolUse, input: "" } };
    }
  }

  if (contentBlockDelta) {
    const { contentBlockIndex, delta } = contentBlockDelta;
    content[contentBlockIndex] ||= {};
    const block = content[contentBlockIndex];

    if (delta.reasoningContent) {
      block.reasoningContent ||= { reasoningText: {} };
      const { text, signature, redactedContent } = delta.reasoningContent;
      if (text) {
        block.reasoningContent.reasoningText.text ||= "";
        block.reasoningContent.reasoningText.text += text;
      } else if (signature) {
        block.reasoningContent.reasoningText.signature ||= "";
        block.reasoningContent.reasoningText.signature += signature;
      } else if (redactedContent) {
        block.reasoningContent.redactedContent ||= "";
        block.reasoningContent.redactedContent += redactedContent;
      }
    } else if (delta.text !== undefined) {
      block.text ||= "";
      block.text += delta.text;
    } else if (delta.toolUse) {
      block.toolUse.input ||= "";
      block.toolUse.input += delta.toolUse.input;
    }
  }

  if (contentBlockStop) {
    // Content block is complete, no additional processing needed
  }
}

// =================================================================================
// FILE UPLOAD PROCESSING
// =================================================================================

const FORMAT_TO_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const TEXT_FORMATS = new Set(["txt", "md", "csv", "html", "json", "xml"]);

/**
 * Extracts text content from file bytes for resource storage.
 * Text formats are decoded as UTF-8, known binary formats are parsed,
 * everything else is stored as base64.
 */
async function extractContent(rawBytes, format) {
  if (TEXT_FORMATS.has(format)) {
    return { content: new TextDecoder().decode(rawBytes), encoding: "utf-8" };
  }
  const mime = FORMAT_TO_MIME[format];
  if (mime) {
    try {
      return { content: await parseDocument(rawBytes, mime), encoding: "utf-8" };
    } catch (e) {
      console.warn(`Failed to parse ${format}:`, e.message);
    }
  }
  return { content: rawBytes.toString("base64"), encoding: "base64" };
}

/**
 * Processes user-uploaded file blocks:
 * 1. Decodes base64 bytes and stores each file as a resource (with text extraction)
 * 2. Strips resource-only blocks from the message (model is informed via <uploaded_files>)
 * 3. Converts remaining inline file bytes from base64 to Buffer for Bedrock
 *
 * Mutates userMessage.content in place.
 */
async function processUploads(userMessage, { userId, agentId, conversationId, cms }) {
  const blocks = userMessage.content || [];

  // Store all files as resources
  for (const block of blocks) {
    const file = block.document || block.image;
    if (!file?.source?.bytes) continue;

    const rawBytes =
      typeof file.source.bytes === "string"
        ? Buffer.from(file.source.bytes, "base64")
        : Buffer.from(file.source.bytes);

    const { content, encoding } = await extractContent(rawBytes, file.format);

    await cms.addResource(userId, {
      agentID: agentId,
      conversationID: conversationId,
      name: file.originalName || file.name,
      type: block.document ? "document" : "image",
      content,
      metadata: { format: file.format, encoding },
    });

    // Prepare inline blocks for Bedrock (raw Buffer, no extra flags)
    if (!file.resourceOnly) {
      file.source.bytes = rawBytes;
    }
  }

  // Remove resource-only blocks — the model already knows about these
  // via the <uploaded_files> tag the client injected into the text block.
  // Also clean transport-only fields (resourceOnly, originalName) that
  // Bedrock doesn't understand.
  userMessage.content = blocks.filter((block) => {
    const file = block.document || block.image;
    if (!file?.source?.bytes) return true; // text blocks, etc.
    if (file.resourceOnly) return false;
    delete file.resourceOnly;
    delete file.originalName;
    return true;
  });
}

function getDefaultSystemPrompt(time, memoryContent) {
  const currentYear = new Date().getFullYear();
  return `You are Ada, a sophisticated colleague for professionals at the National Cancer Institute. Not a chatbot — a peer.

The current date is ${time}.

# Tools

Search: Craft diverse queries. Never repeat similar searches — each explores a different angle. Include ${currentYear} for current events.
Browse: Follow up on search results. Fetch up to 20 URLs simultaneously for full content.
Data: Access S3 bucket files for analysis.
Editor: Full virtual filesystem — create, view, edit, delete, rename files. Organize work, build deliverables, maintain persistent context.
Think: Dedicated reasoning space. Include the COMPLETE information that needs analysis.

When citing search/browse results, use inline markdown citations: [(Author, Year)](url).

# File System

The editor tool is a full virtual filesystem. Use it freely — organize research, draft documents, build deliverables, store data.

Two directories persist across conversations:
- \`memories/\` — User context, preferences, project state, key decisions. Updated automatically as you learn about the user.
- \`skills/\` — Reusable expertise and workflows. Read the full skill before applying it.

Everything else is conversation-scoped and disappears when the conversation ends.

## Memories

Memory file contents are automatically loaded into your context (below). You don't need to read them at the start of a conversation — they're already here.

Your job is to **maintain** memories as you work:
- Save user preferences, project context, important decisions, and ongoing work to \`memories/\` files
- Keep memories organized — use descriptive filenames, consolidate related info, delete stale entries
- Assume interruption: save progress you don't want to lose

## Skills

Skill filenames are listed in your context below. When a skill is relevant, read its full instructions with \`editor view skills/{name}.md\` before applying it.

Create skills to capture reusable workflows:
\`\`\`
---
name: skill-name
description: When to use this skill
---
[Detailed instructions]
\`\`\`

# Context

<memory>
${memoryContent}
</memory>`;
}
