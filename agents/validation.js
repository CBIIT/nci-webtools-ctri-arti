import { validateConversationMessage } from "shared/utils.js";

export function validateUserMessageContent(content) {
  validateConversationMessage("user", content);
}
