import { readFile } from "node:fs/promises";
import net from "node:net";
import { createInterface } from "node:readline";

import Handlebars from "handlebars";
import { createTransport } from "nodemailer";
import { formatObject } from "shared/logger.js";

const EMAIL_TEMPLATE_URL = new URL("../templates/error-log-report.hbs", import.meta.url);

let emailTemplate = null;

async function getCompiledTemplate() {
  if (!emailTemplate) {
    emailTemplate = (async () => {
      const source = await readFile(EMAIL_TEMPLATE_URL, "utf8");
      return Handlebars.compile(source, { strict: true });
    })();
  }

  return emailTemplate;
}

export async function sendEmail(params, env = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = env;
  const config = {
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: +SMTP_PORT === 465,
  };
  if (SMTP_USER && SMTP_PASSWORD) {
    config.auth = {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    };
  }
  const transporter = createTransport(config);
  return await transporter.sendMail(params);
}

export async function sendFeedback({ feedback, context }, env = process.env) {
  const { EMAIL_ADMIN, EMAIL_SENDER } = env;
  return await sendEmail({
    from: (EMAIL_SENDER || EMAIL_ADMIN)?.split(",")?.[0]?.trim(),
    to: EMAIL_ADMIN,
    subject: "Feedback from Research Optimizer",
    text: feedback,
    attachments: [
      {
        filename: "context.json",
        content: JSON.stringify(context, null, 2),
      },
    ],
  });
}

export async function sendJustificationEmail(
  { justification, userName, userEmail, currentLimit },
  env = process.env,
  send = sendEmail
) {
  const { EMAIL_ADMIN, EMAIL_SENDER, TIER } = env;
  const tierPrefix = TIER && TIER.toUpperCase() !== "PROD" ? `[${TIER.toUpperCase()}] ` : "";
  const text =
    "Hello Admin Team,\n\n" +
    "A new request has been submitted to increase a user’s daily cost limit. Please review the details below:\n\n" +
    `User Name: [${userName}]\nUser Email: [${userEmail}]\nCurrent Daily Limit: $[${currentLimit}]\n` +
    `Reason for Request:\n\n${justification}\n\nPlease review this request and take the appropriate action.\n\n` +
    "Thank you,\nResearch Optimizer System";

  return await send({
    from: (EMAIL_SENDER || EMAIL_ADMIN)?.split(",")?.[0]?.trim(),
    to: EMAIL_ADMIN,
    subject: `${tierPrefix}User Request Limit Increase`,
    text,
  }, env);
}

function formatMetadataForTemplate(metadata) {
  if (!Array.isArray(metadata)) {
    return null;
  }

  return metadata.map(({ label, value: raw }) => {
    const value = Array.isArray(raw) ? raw.map(formatObject).join("\n\n") : formatObject(raw);
    const isMultiline = value.includes("\n") || (!!raw && typeof raw === "object");
    return { label, value, isMultiline };
  });
}

function buildPlainTextFallback({ reportSource, timestamp, userId, userName, metadata, version }) {
  const isUserReported = reportSource?.toUpperCase() === "USER";
  const lines = [isUserReported ? "Issue Reported by a User" : "Application Error", ""];

  if (version) {
    lines.push(`Version: ${version}`);
  }

  lines.push(`Timestamp: ${timestamp}`, `User ID: ${userId}`, `User Name: ${userName}`);

  if (Array.isArray(metadata) && metadata.length > 0) {
    lines.push("", "Details:");
    for (const { label, value } of metadata) {
      const formattedValue = formatObject(value);
      lines.push(`${label}: ${formattedValue}`);
    }
  }

  lines.push(
    "",
    "---",
    "This is an automated report from ResearchOptimizer.",
    "Please do not reply to this email."
  );

  return lines.join("\n");
}

/**
 * Minimal POP3 client for retrieving and purging emails.
 * @param {string} host - POP3 server hostname
 * @param {number|string} port - POP3 server port
 */
export function pop3(host, port) {
  async function session(user) {
    const socket = net.createConnection(+port, host);
    const rl = createInterface({ input: socket });
    const lines = rl[Symbol.asyncIterator]();
    const read = async () => (await lines.next()).value;
    const cmd = async (c) => (socket.write(c + "\r\n"), read());
    const readUntilDot = async () => {
      const out = [];
      for (let l; (l = await read()) !== "."; ) out.push(l);
      return out;
    };
    const close = () => (rl.close(), socket.end());

    await read(); // +OK greeting
    await cmd(`USER ${user}`);
    await cmd(`PASS password`);
    return { cmd, readUntilDot, close };
  }

  return {
    async getEmails(user) {
      const pop = await session(user);
      const resp = await pop.cmd("LIST");
      if (!resp.startsWith("+OK")) return (pop.close(), []);
      const listing = await pop.readUntilDot();
      const emails = [];
      for (const entry of listing) {
        await pop.cmd(`RETR ${entry.split(" ")[0]}`);
        const body = (await pop.readUntilDot()).join("\r\n");
        const subject = body.match(/^subject:\s*(.+)/im)?.[1] || "";
        emails.push({ subject, mimeMessage: body });
      }
      await pop.cmd("QUIT");
      pop.close();
      return emails;
    },

    async purge(user) {
      const pop = await session(user);
      const resp = await pop.cmd("LIST");
      if (resp.startsWith("+OK")) {
        for (const entry of await pop.readUntilDot()) {
          await pop.cmd(`DELE ${entry.split(" ")[0]}`);
        }
      }
      await pop.cmd("QUIT");
      pop.close();
    },
  };
}

export async function sendLogReport(
  { reportSource, userId, userName, metadata, recipient },
  env = process.env
) {
  const { EMAIL_SENDER, EMAIL_ADMIN, EMAIL_DEV, VERSION, TIER } = env;

  const template = await getCompiledTemplate();
  const timestamp = new Date().toLocaleString();
  const userIdValue = userId || "N/A";
  const userNameValue = userName || "N/A";
  const isUserReported = reportSource?.toUpperCase() === "USER";

  const tierPrefix = TIER && TIER.toUpperCase() !== "PROD" ? `[${TIER.toUpperCase()}] ` : "";
  const subject = `${tierPrefix}[ResearchOptimizer Error] ${isUserReported ? "User-Reported Issue" : "Application Error"}`;

  const html = template({
    timestamp,
    userId: userIdValue,
    userName: userNameValue,
    version: VERSION || null,
    isUserReported,
    detailRows: formatMetadataForTemplate(metadata || []),
  });

  const text = buildPlainTextFallback({
    reportSource,
    timestamp,
    userId: userIdValue,
    userName: userNameValue,
    metadata,
    version: VERSION || null,
  });

  return sendEmail(
    {
      from: (EMAIL_SENDER || EMAIL_ADMIN)?.split(",")?.[0]?.trim(),
      to: recipient || EMAIL_DEV,
      subject,
      html,
      text,
    },
    env
  );
}
