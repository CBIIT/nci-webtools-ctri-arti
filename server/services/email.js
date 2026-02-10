import { readFile } from "node:fs/promises";

import Handlebars from "handlebars";
import { createTransport } from "nodemailer";

import { formatObject } from "./logger.js";

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
    from: EMAIL_SENDER || EMAIL_ADMIN,
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
      from: EMAIL_SENDER || EMAIL_ADMIN,
      to: recipient || EMAIL_DEV,
      subject,
      html,
      text,
    },
    env
  );
}
