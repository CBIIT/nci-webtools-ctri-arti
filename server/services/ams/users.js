import {
  User, Role, Conversation, UserAgent, UserTool,
} from "../database.js";
import { serviceError } from "./utils.js";
import { deleteConversationCascade } from "./conversations.js";

const userIncludes = [{ model: Role, attributes: ["id", "name"] }];

function formatUser(u) {
  const json = u.toJSON();
  return {
    userID: json.id,
    firstName: json.firstName,
    lastName: json.lastName,
    email: json.email,
    role: json.Role?.name || null,
    status: json.status,
    budget: json.budget,
  };
}

export async function createUser(userId, data) {
  const { firstName, lastName, email, role, budget } = data;

  if (!firstName) throw serviceError(400, "firstName is required");
  if (!lastName) throw serviceError(400, "lastName is required");
  if (!email) throw serviceError(400, "email is required");
  if (!role) throw serviceError(400, "role is required");

  let roleId = null;
  if (role) {
    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) throw serviceError(400, `Role "${role}" not found`);
    roleId = roleRecord.id;
  }

  const user = await User.create({
    firstName,
    lastName,
    email,
    roleId,
    budget: budget || null,
    remaining: budget || null,
    status: "active",
  });

  const result = await User.findByPk(user.id, { include: userIncludes });
  return formatUser(result);
}

export async function getUsers(userId, query = {}) {
  const where = {};
  if (query.status) where.status = query.status;

  const include = [{ model: Role, attributes: ["id", "name"] }];
  if (query.role) {
    include[0].where = { name: query.role };
  }

  const users = await User.findAll({ where, include, order: [["id", "ASC"]] });
  return users.map((u) => formatUser(u));
}

export async function getUser(userId, id) {
  const user = await User.findByPk(id, { include: userIncludes });
  if (!user) throw serviceError(404, "User not found");
  return formatUser(user);
}

export async function updateUser(userId, id, data) {
  const user = await User.findByPk(id);
  if (!user) throw serviceError(404, "User not found");

  const { firstName, lastName, email, role, status, budget } = data;

  const updates = {};
  if (firstName !== undefined) updates.firstName = firstName;
  if (lastName !== undefined) updates.lastName = lastName;
  if (email !== undefined) updates.email = email;
  if (status !== undefined) updates.status = status;
  if (budget !== undefined) {
    updates.budget = budget;
    updates.remaining = budget;
  }

  if (role !== undefined) {
    const roleRecord = await Role.findOne({ where: { name: role } });
    if (!roleRecord) throw serviceError(400, `Role "${role}" not found`);
    updates.roleId = roleRecord.id;
  }

  await User.update(updates, { where: { id } });

  const result = await User.findByPk(id, { include: userIncludes });
  return formatUser(result);
}

export async function deleteUser(userId, id) {
  const user = await User.findByPk(id);
  if (!user) throw serviceError(404, "User not found");

  const conversations = await Conversation.findAll({
    where: { userId: id },
    attributes: ["id"],
  });
  for (const conv of conversations) {
    await deleteConversationCascade(conv.id);
  }

  await UserAgent.destroy({ where: { userId: id } });
  await UserTool.destroy({ where: { userId: id } });
  await User.destroy({ where: { id } });

  return { success: true };
}
