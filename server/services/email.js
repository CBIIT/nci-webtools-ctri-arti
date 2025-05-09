import { createTransport } from "nodemailer";

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

export async function sendFeedback({feedback, context}, env = process.env) {
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
