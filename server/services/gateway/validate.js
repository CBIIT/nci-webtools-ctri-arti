import { Agent, Model, User } from "../database.js";
import { ErrorType, sendError } from "./errors.js";

/**
 * Validate common request fields and load database records.
 * Sends an error response and returns null if validation fails.
 *
 * @param {Object} res - Express response object
 * @param {Object} options
 * @param {Object} options.body - Request body
 * @param {string[]} options.requiredFields - Field names to check for presence
 * @param {Array} [options.modelInclude] - Sequelize include option for Model.findByPk
 * @returns {Promise<{userRecord, agentRecord, modelRecord}|null>}
 */
export async function validateRequest(res, { body, requiredFields, modelInclude }) {
  const missingFields = requiredFields.filter((f) => !body[f]);
  if (missingFields.length > 0) {
    sendError(res, {
      errorType: ErrorType.MISSING_REQUIRED_FIELD,
      message: `Missing required fields: ${missingFields.join(", ")}`,
      details: { missing_fields: missingFields },
    });
    return null;
  }

  if (body.stream !== undefined && typeof body.stream !== "boolean") {
    sendError(res, {
      errorType: ErrorType.INVALID_INPUT_FORMAT,
      message: "stream must be a boolean",
    });
    return null;
  }

  const userRecord = await User.findByPk(body.user_id);
  if (!userRecord) {
    sendError(res, {
      errorType: ErrorType.INVALID_USER,
      message: `Invalid user_id: "${body.user_id}". User not found in database.`,
      details: { user_id: body.user_id },
    });
    return null;
  }

  if (userRecord.budget !== null && userRecord.remaining !== null && userRecord.remaining <= 0) {
    sendError(res, {
      errorType: ErrorType.QUOTA_EXCEEDED,
      message:
        "You have reached your allocated daily usage limit. Your access will reset at midnight.",
      details: { budget: userRecord.budget, remaining: userRecord.remaining },
    });
    return null;
  }

  const agentRecord = await Agent.findByPk(body.agent_id);
  if (!agentRecord) {
    sendError(res, {
      errorType: ErrorType.INVALID_AGENT,
      message: `Invalid agent_id: "${body.agent_id}". Agent not found in database.`,
      details: { agent_id: body.agent_id },
    });
    return null;
  }

  const findOptions = modelInclude ? { include: modelInclude } : undefined;
  const modelRecord = await Model.findByPk(body.model_id, findOptions);
  if (!modelRecord) {
    sendError(res, {
      errorType: ErrorType.INVALID_MODEL,
      message: `Invalid model_id: "${body.model_id}". Model ID not found in database.`,
      details: { model_id: body.model_id },
    });
    return null;
  }

  return { userRecord, agentRecord, modelRecord };
}
