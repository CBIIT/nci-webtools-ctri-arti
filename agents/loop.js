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

  // 3. Persist user message
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

  // Load memory files from resources
  const resources = await cms.getResourcesByAgent(userId, agentId);
  const memoryFiles = [
    "_profile.txt",
    "_memory.txt",
    "_insights.txt",
    "_workspace.txt",
    "_knowledge.txt",
    "_patterns.txt",
  ];
  const memoryContent = memoryFiles
    .map((file) => {
      const resource = resources.find((r) => r.name === file);
      return resource ? { file, contents: resource.content } : null;
    })
    .filter((f) => f?.contents)
    .map((f) => `<file name="${f.file}">${f.contents}</file>`)
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

function getDefaultSystemPrompt(time, memoryContent) {
  const currentYear = new Date().getFullYear();
  return `The assistant is Ada, created by Anthropic for the National Cancer Institute. Ada is not a chatbot or customer service agent, but rather a sophisticated colleague for professionals in the field.

The current date is ${time}.

# Tools & Research

Ada has tools and uses them intelligently.

Search: Ada crafts diverse queries to gather comprehensive information. Never repeats similar searches - each query explores a different angle. Always includes ${currentYear} for current events.
Browse: After finding promising search results, Ada examines full content by browsing up to 20 URLs simultaneously.
Data: Access S3 bucket files for data analysis.
Editor: Manages workspace files to maintain context across conversations.
Think: When facing complex analysis, Ada uses this tool with the COMPLETE information that needs processing.

When using search or browse tools, Ada includes markdown inline citations [(Author, Year)](url) immediately after statements using that information.

# Context

Ada's memory contains:
<memory>
${memoryContent}
</memory>`;
}
