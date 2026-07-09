const config = require('../config');

let transporter = null;

function isEmailConfigured() {
  return Boolean(config.SMTP_HOST && config.SMTP_FROM);
}

async function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!isEmailConfigured()) {
    return null;
  }

  const nodemailer = require('nodemailer');

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: config.SMTP_USER
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
  });

  return transporter;
}

function buildAuthUrl(path, token) {
  const base = config.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}${path}?token=${encodeURIComponent(token)}`;
}

async function sendMail({ to, subject, text, html }) {
  const transport = await getTransporter();

  if (!transport) {
    if (config.EMAIL_DEV_LOG) {
      console.log(`[email-dev] To: ${to}\nSubject: ${subject}\n${text}`);
      return { dev: true, logged: true };
    }

    const error = new Error('Email is not configured on this server');
    error.status = 503;
    throw error;
  }

  await transport.sendMail({
    from: config.SMTP_FROM,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
}

async function sendVerificationEmail(email, token) {
  const url = buildAuthUrl('/auth/verify-email', token);

  return sendMail({
    to: email,
    subject: 'Verify your Recall account',
    text: `Welcome to Recall!\n\nVerify your email by opening this link:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Welcome to Recall!</p><p><a href="${url}">Verify your email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

async function sendPasswordResetEmail(email, token) {
  const url = buildAuthUrl('/auth/reset-password', token);

  return sendMail({
    to: email,
    subject: 'Reset your Recall password',
    text: `Reset your password by opening this link:\n${url}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    html: `<p><a href="${url}">Reset your password</a></p><p>This link expires in 1 hour.</p>`,
  });
}

async function sendEmailChangeEmail(newEmail, token) {
  const url = buildAuthUrl('/auth/confirm-email-change', token);

  return sendMail({
    to: newEmail,
    subject: 'Confirm your new Recall email',
    text: `Confirm your new email by opening this link:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p><a href="${url}">Confirm your new email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

module.exports = {
  isEmailConfigured,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeEmail,
  buildAuthUrl,
};
