import { getToolFn } from "../tools/index.js";
import { getToolSpecs } from "../tools/specs.js";

import { buildSystemPrompt } from "./prompt.js";
import { accumulateContent, parseToolUseInputs } from "./streaming.js";
import { processUploads } from "./uploads.js";

const DEFAULT_TOOL_NAMES = ["search", "browse", "data", "editor", "think"];
const TERMINAL_STOP_REASONS = new Set([
  "end_turn",
  "guardrail_intervened",
  "content_filtered",
  "max_tokens",
  "stop_sequence",
  "malformed_model_output",
  "malformed_tool_use",
  "model_context_window_exceeded",
]);

async function loadAgentSession({ userId, agentId, conversationId, modelOverride, cms }) {
  const agent = await cms.getAgent(userId, agentId);
  if (!agent) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const effectiveModel = modelOverride || agent.runtime?.model;
  if (!effectiveModel) {
    throw new Error(`Agent runtime model not resolved: ${agentId}`);
  }

  const toolNames = agent.tools || DEFAULT_TOOL_NAMES;
  const toolSpecs = getToolSpecs(toolNames);
  const tools = toolSpecs.map(({ toolSpec }) => ({ toolSpec }));

  const conversation = await cms.getConversation(userId, conversationId);
  if (!conversation) {
    throw new Error(`Conversation not found: ${conversationId}`);
  }

  return { agent, conversation, effectiveModel, tools };
}

async function* streamConversationSummary(
  cms,
  { userId, conversationId, model, system, tools, thoughtBudget, userText, requestId }
) {
  const summaryStream = cms.summarize(userId, conversationId, {
    model,
    system,
    tools,
    thoughtBudget,
    userText,
    requestId,
  });
  const summaryIterator = summaryStream?.[Symbol.asyncIterator]?.();
  if (!summaryIterator) {
    return;
  }

  const firstEvent = await summaryIterator.next();
  if (firstEvent.done) {
    return;
  }

  yield { summarizing: true };
  yield firstEvent.value;
  for await (const chunk of { [Symbol.asyncIterator]: () => summaryIterator }) {
    yield chunk;
  }
  yield { summarizing: false };
}

function buildConversationMessages(context, userMessage) {
  const existingMessages = context?.messages || [];
  const messages = existingMessages.map(({ role, content }) => ({ role, content }));

  if (messages.length && messages.at(-1).role !== "user") {
    messages.push({ role: "user", content: userMessage.content });
  }

  return messages;
}

async function createToolResultEvent(toolUse, toolContext) {
  const toolFn = getToolFn(toolUse.name);

  try {
    const result = await toolFn(toolUse.input, toolContext);
    return {
      toolResult: {
        toolUseId: toolUse.toolUseId,
        content: [{ json: { results: result } }],
      },
    };
  } catch (error) {
    return {
      toolResult: {
        toolUseId: toolUse.toolUseId,
        content: [{ json: { error: error.stack || error.message || String(error) } }],
      },
    };
  }
}

async function executeToolUses(toolUses, toolContext) {
  const hasClientTools = toolUses.some((toolUse) => !getToolFn(toolUse.name));

  if (hasClientTools) {
    const clientRequests = toolUses
      .filter((toolUse) => !getToolFn(toolUse.name))
      .map((toolUse) => ({
        clientToolRequest: {
          toolUseId: toolUse.toolUseId,
          name: toolUse.name,
          input: toolUse.input,
        },
      }));

    const serverResults = [];
    for (const toolUse of toolUses) {
      if (!getToolFn(toolUse.name)) continue;
      serverResults.push(await createToolResultEvent(toolUse, toolContext));
    }

    return { done: true, clientRequests, serverResults, toolResultsMessage: null };
  }

  const serverResults = [];
  const toolResultsMessage = { role: "user", content: [] };

  for (const toolUse of toolUses) {
    const toolResult = await createToolResultEvent(toolUse, toolContext);
    serverResults.push(toolResult);
    toolResultsMessage.content.push(toolResult);
  }

  return { done: false, clientRequests: [], serverResults, toolResultsMessage };
}

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
 * @param {string} params.modelOverride - optional explicit model override
 * @param {number} params.thoughtBudget - 0 for no reasoning, >0 for extended thinking
 * @param {Object} params.gateway - gateway client { invoke }
 * @param {Object} params.cms - CMS client
 */
export async function* runAgentLoop({
  userId,
  requestId,
  agentId,
  conversationId,
  userMessage,
  modelOverride,
  thoughtBudget = 0,
  gateway,
  cms,
}) {
  const { agent, conversation, effectiveModel, tools } = await loadAgentSession({
    userId,
    agentId,
    conversationId,
    modelOverride,
    cms,
  });

  await processUploads(userMessage, { userId, agentId, conversationId, cms });
  await cms.appendConversationMessage(userId, {
    conversationId,
    role: "user",
    content: userMessage.content,
    parentID: userMessage.parentID || null,
  });

  const system = await buildSystemPrompt({ agent, conversation, userId, agentId, cms });
  const userText =
    userMessage.content
      ?.filter((contentBlock) => contentBlock.text)
      .map((contentBlock) => contentBlock.text)
      .join("\n") || "";

  for await (const event of streamConversationSummary(cms, {
    userId,
    conversationId,
    model: effectiveModel,
    system,
    tools,
    thoughtBudget,
    userText,
    requestId,
  })) {
    yield event;
  }

  const context = await cms.getContext(userId, conversationId, { compressed: true });
  const messages = buildConversationMessages(context, userMessage);
  const toolContext = { userId, requestId, agentId, conversationId, gateway, cms };

  let done = false;
  while (!done) {
    const result = await gateway.invoke({
      userId,
      requestId,
      model: effectiveModel,
      messages,
      system,
      tools,
      thoughtBudget,
      stream: true,
      type: agent.name || "agent",
      guardrailConfig: agent.runtime?.guardrailConfig || null,
    });

    if (result.status === 429) {
      yield { agentError: { message: result.error } };
      return;
    }

    const assistantContent = [];
    let stopReason = null;

    for await (const chunk of result.stream) {
      yield chunk;
      accumulateContent(assistantContent, chunk);

      if (chunk.messageStop) {
        stopReason = chunk.messageStop.stopReason;
      }
    }

    parseToolUseInputs(assistantContent);

    const assistantMessage = { role: "assistant", content: assistantContent };
    await cms.appendConversationMessage(userId, {
      conversationId,
      role: "assistant",
      content: assistantMessage.content,
    });
    messages.push(assistantMessage);

    if (!stopReason || TERMINAL_STOP_REASONS.has(stopReason)) {
      done = true;
      continue;
    }

    if (stopReason !== "tool_use") {
      continue;
    }

    const toolUses = assistantContent
      .filter((contentBlock) => contentBlock.toolUse)
      .map((contentBlock) => contentBlock.toolUse);
    const {
      clientRequests,
      serverResults,
      toolResultsMessage,
      done: toolExecutionDone,
    } = await executeToolUses(toolUses, toolContext);

    for (const event of clientRequests) {
      yield event;
    }
    for (const event of serverResults) {
      yield event;
    }

    if (toolResultsMessage) {
      await cms.appendConversationMessage(userId, {
        conversationId,
        role: "user",
        content: toolResultsMessage.content,
      });
      messages.push(toolResultsMessage);
    }

    done = toolExecutionDone;
  }
}
