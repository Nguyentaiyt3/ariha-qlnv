import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export function getMailTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

export interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  senderName?: string;   // display name of the person who triggered the action
  senderEmail?: string;  // set as Reply-To so replies go to the actual person
}

export async function sendMail(options: SendMailOptions): Promise<void> {
  const mailer = getMailTransporter();
  const systemEmail = process.env.GMAIL_USER;

  // From always uses system SMTP account (required by Gmail auth),
  // but we show the triggering user's name so the recipient knows who sent it.
  const fromField = options.senderName
    ? `"${options.senderName} (WorkHub)" <${systemEmail}>`
    : `"ARiHA WorkHub" <${systemEmail}>`;

  await mailer.sendMail({
    from: fromField,
    replyTo: options.senderEmail ?? systemEmail,
    to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
  });
}
