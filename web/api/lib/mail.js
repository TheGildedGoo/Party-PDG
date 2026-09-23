import { Resend } from "resend";
import { httpError } from "./http.js";

export function fromAddress() {
  return process.env.RESEND_FROM || "Party-PDG <noreply@pdg-play.com>";
}

function layout(title, preheader, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title></head>
<body style="margin:0;background:#f4f7fb;color:#07141f;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td>
          <p style="margin:0 0 8px;font-size:14px;letter-spacing:0.08em;color:#8a5a00;">PARTY-PDG</p>
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;">${title}</h1>
          ${bodyHtml}
          <p style="margin:24px 0 0;font-size:14px;color:#3d4d5c;">Unofficial AFH 1 study aid. Not an Air Force product.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href, label) {
  return `<p style="margin:20px 0;"><a href="${href}" style="display:inline-block;background:#f5a623;color:#1a1203;text-decoration:none;font-weight:700;padding:14px 18px;border-radius:12px;font-size:16px;">${label}</a></p>`;
}

export async function sendMail({ to, subject, html, text, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY) throw httpError(503, "RESEND_API_KEY is not set.");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = {
    from: fromAddress(),
    to: [to],
    subject,
    html,
    text,
  };
  if (process.env.RESEND_REPLY_TO) payload.replyTo = process.env.RESEND_REPLY_TO;
  const { data, error } = await resend.emails.send(payload, { idempotencyKey });
  if (error) {
    console.error("resend", error.message || error);
    throw httpError(502, "Could not send email.");
  }
  return data;
}

export function verificationMessage(origin, token) {
  const href = `${origin}/api/auth/verify?token=${encodeURIComponent(token)}`;
  const subject = "Verify your email for Party-PDG";
  const text = `Verify your email for Party-PDG.\n\nThis link expires in 24 hours:\n${href}\n\nIf you did not register, ignore this email.`;
  const html = layout(
    "Verify your email",
    "This link expires in 24 hours.",
    `<p style="font-size:16px;line-height:1.45;">Confirm this address so you can start the 30-day trial and play.</p>
     ${button(href, "Verify email")}
     <p style="font-size:16px;line-height:1.45;">This link expires in 24 hours. If you did not register, you can ignore this email.</p>`
  );
  return { subject, html, text };
}

export function resetMessage(origin, token) {
  const href = `${origin}/?reset=${encodeURIComponent(token)}`;
  const subject = "Reset your Party-PDG password";
  const text = `Reset your Party-PDG password.\n\nThis link expires in 1 hour:\n${href}\n\nIf you did not ask for this, ignore this email.`;
  const html = layout(
    "Reset your password",
    "This link expires in 1 hour.",
    `<p style="font-size:16px;line-height:1.45;">Choose a new password for Party-PDG.</p>
     ${button(href, "Reset password")}
     <p style="font-size:16px;line-height:1.45;">This link expires in 1 hour. If you did not ask for a reset, you can ignore this email.</p>`
  );
  return { subject, html, text };
}
