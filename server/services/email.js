import { createTransport } from "nodemailer";

export async function sendEmail(params, env = process.env) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = env;

  const transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: +SMTP_PORT === 465,
    auth:
      SMTP_USER && SMTP_PASSWORD
        ? {
            user: SMTP_USER,
            pass: SMTP_PASSWORD,
          }
        : undefined,
  });

  return await transporter.sendMail(params);
}

export async function sendFeedback({from, feedback, context}, env = process.env) {
  const { EMAIL_ADMIN } = env;
  return await sendEmail({
    from: from || EMAIL_ADMIN,
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