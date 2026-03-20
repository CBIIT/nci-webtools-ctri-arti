export function normalizeCmsResource(resource = {}) {
  return {
    ...resource,
    userId: resource.userID ?? null,
    agentId: resource.agentID ?? null,
    conversationId: resource.conversationID ?? null,
    messageId: resource.messageID ?? null,
  };
}

export function normalizeCmsResources(resources = []) {
  return resources.map((resource) => normalizeCmsResource(resource));
}
