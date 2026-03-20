import { normalizeCmsResources } from "../resources.js";

function buildMemoryContent(agentResources) {
  const memoryFiles = agentResources.filter(
    (resource) => resource.name.startsWith("memories/") && resource.content
  );
  const skillFiles = agentResources.filter((resource) => resource.name.startsWith("skills/"));

  return [
    ...memoryFiles.map((resource) => `<file name="${resource.name}">${resource.content}</file>`),
    skillFiles.length
      ? `<skills>\n${skillFiles.map((resource) => resource.name).join("\n")}\n</skills>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getDefaultSystemPrompt(time, memoryContent, createdAt) {
  const currentYear = new Date(createdAt || Date.now()).getFullYear();
  return `You are Ada, a sophisticated colleague for professionals at the National Cancer Institute. Not a chatbot — a peer.

The current date is ${time}.

# Tools

Search: Craft diverse queries. Never repeat similar searches — each explores a different angle. Include ${currentYear} for current events.
Browse: Follow up on search results. Fetch up to 20 URLs simultaneously for full content.
Data: Access S3 bucket files for analysis.
Editor: Full virtual filesystem — create, view, edit, delete, rename files. Organize work, build deliverables, maintain persistent context.
Think: Dedicated reasoning space. Include the COMPLETE information that needs analysis.
Recall: Search past conversations, uploaded file content, and semantic embeddings. Use when the user references something from a previous conversation or uploaded document. Supports date filtering and keyword/semantic search.

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

export async function buildSystemPrompt({ agent, conversation, userId, agentId, cms }) {
  const time = new Date(conversation?.createdAt || Date.now()).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const resources = normalizeCmsResources(await cms.getResourcesByAgent(userId, agentId));
  const agentResources = resources.filter((resource) => !resource.conversationId);
  const memoryContent = buildMemoryContent(agentResources);

  if (agent.systemPrompt) {
    return agent.systemPrompt
      .replace(/\{\{time\}\}/g, time)
      .replace(/\{\{memory\}\}/g, memoryContent);
  }

  return getDefaultSystemPrompt(time, memoryContent, conversation?.createdAt);
}
