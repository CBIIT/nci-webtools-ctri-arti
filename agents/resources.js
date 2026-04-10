export function normalizeCmsResource(resource = {}) {
  return {
    ...resource,
    userId: resource.userID ?? null,
    agentId: resource.agentID ?? null,
    conversationId: resource.conversationID ?? null,
    messageId: resource.messageID ?? null,
  };
}
