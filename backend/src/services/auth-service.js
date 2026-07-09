const usersDb = require('../db/users');
const authTokensDb = require('../db/auth-tokens');
const emailService = require('./email-service');
const {
  signAccessToken,
  generateRefreshToken,
} = require('../utils/jwt');

async function issueTokenPair(user, device = 'api') {
  const access_token = signAccessToken(user);
  const refresh_token = generateRefreshToken();

  await usersDb.storeRefreshToken(user.id, refresh_token, device);

  return {
    access_token,
    refresh_token,
    user: usersDb.publicUser(user),
  };
}

async function sendVerificationForUser(user) {
  await authTokensDb.revokeTokensForUser(user.id, 'email_verify');
  const token = await authTokensDb.createToken(user.id, 'email_verify');
  const result = await emailService.sendVerificationEmail(user.email, token);

  if (result?.dev && result?.logged) {
    return { verification_url: emailService.buildAuthUrl('/auth/verify-email', token) };
  }

  return { sent: true };
}

async function register(email, password, device = 'api') {
  if (!usersDb.validateEmail(email)) {
    const error = new Error('Invalid email address');
    error.status = 400;
    throw error;
  }

  if (!usersDb.validatePassword(password)) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const existing = await usersDb.findUserByEmail(email);

  if (existing) {
    const error = new Error('Email already registered');
    error.status = 409;
    throw error;
  }

  const passwordHash = await usersDb.hashPassword(password);
  const user = await usersDb.createUser({ email, passwordHash });
  await usersDb.updateLastLogin(user.id);

  const tokens = await issueTokenPair(user, device);
  const emailResult = await sendVerificationForUser(user);

  return {
    ...tokens,
    message: 'Account created. Check your email to verify your address.',
    ...emailResult,
  };
}

async function login(email, password, device = 'api') {
  const user = await usersDb.findUserByEmail(email);

  if (!user || !user.password_hash) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const valid = await usersDb.verifyPassword(password, user.password_hash);

  if (!valid) {
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  await usersDb.updateLastLogin(user.id);
  return issueTokenPair(user, device);
}

async function refresh(refreshToken, device = 'api') {
  const rotated = await usersDb.rotateRefreshToken(refreshToken, device);
  const user = await usersDb.findUserById(rotated.userId);

  if (!user) {
    const error = new Error('User not found');
    error.status = 401;
    throw error;
  }

  return {
    access_token: signAccessToken(user),
    refresh_token: rotated.refreshToken,
    user: usersDb.publicUser(user),
  };
}

async function logout(refreshToken) {
  if (refreshToken) {
    await usersDb.revokeRefreshToken(refreshToken);
  }

  return { ok: true };
}

async function getMe(userId) {
  const user = await usersDb.findUserById(userId);

  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return usersDb.publicUser(user);
}

async function verifyEmail(token) {
  const record = await authTokensDb.consumeToken(token, 'email_verify');
  const user = await usersDb.markEmailVerified(record.user_id);

  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  return usersDb.publicUser(user);
}

async function resendVerification(userId) {
  const user = await usersDb.findUserById(userId);

  if (!user) {
    const error = new Error('User not found');
    error.status = 404;
    throw error;
  }

  if (user.email_verified) {
    return { message: 'Email is already verified' };
  }

  const emailResult = await sendVerificationForUser(user);
  return { message: 'Verification email sent', ...emailResult };
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await usersDb.findUserById(userId);

  if (!user?.password_hash) {
    const error = new Error('Password login is not enabled for this account');
    error.status = 400;
    throw error;
  }

  const valid = await usersDb.verifyPassword(currentPassword, user.password_hash);

  if (!valid) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }

  if (!usersDb.validatePassword(newPassword)) {
    const error = new Error('New password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const updated = await usersDb.updatePassword(userId, newPassword);
  return usersDb.publicUser(updated);
}

async function requestPasswordReset(email) {
  const user = await usersDb.findUserByEmail(email);

  if (!user || !user.password_hash) {
    return { message: 'If that email exists, a reset link has been sent' };
  }

  await authTokensDb.revokeTokensForUser(user.id, 'password_reset');
  const token = await authTokensDb.createToken(user.id, 'password_reset');
  const result = await emailService.sendPasswordResetEmail(user.email, token);

  const response = { message: 'If that email exists, a reset link has been sent' };

  if (result?.dev && result?.logged) {
    response.reset_url = emailService.buildAuthUrl('/auth/reset-password', token);
  }

  return response;
}

async function resetPassword(token, newPassword) {
  if (!usersDb.validatePassword(newPassword)) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const record = await authTokensDb.consumeToken(token, 'password_reset');
  const updated = await usersDb.updatePassword(record.user_id, newPassword);
  return usersDb.publicUser(updated);
}

async function requestEmailChange(userId, newEmail, currentPassword) {
  if (!usersDb.validateEmail(newEmail)) {
    const error = new Error('Invalid email address');
    error.status = 400;
    throw error;
  }

  const user = await usersDb.findUserById(userId);

  if (!user?.password_hash) {
    const error = new Error('Password confirmation required');
    error.status = 400;
    throw error;
  }

  const valid = await usersDb.verifyPassword(currentPassword, user.password_hash);

  if (!valid) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }

  const normalized = usersDb.normalizeEmail(newEmail);

  if (normalized === user.email) {
    const error = new Error('New email must be different from current email');
    error.status = 400;
    throw error;
  }

  const existing = await usersDb.findUserByEmail(normalized);

  if (existing) {
    const error = new Error('Email already in use');
    error.status = 409;
    throw error;
  }

  await usersDb.setPendingEmail(userId, normalized);
  await authTokensDb.revokeTokensForUser(userId, 'email_change');
  const token = await authTokensDb.createToken(userId, 'email_change', { new_email: normalized });
  const result = await emailService.sendEmailChangeEmail(normalized, token);

  const response = {
    message: 'Confirmation link sent to your new email address',
    pending_email: normalized,
  };

  if (result?.dev && result?.logged) {
    response.confirm_url = emailService.buildAuthUrl('/auth/confirm-email-change', token);
  }

  return response;
}

async function confirmEmailChange(token) {
  const record = await authTokensDb.consumeToken(token, 'email_change');
  const newEmail = record.payload?.new_email;

  if (!newEmail) {
    const error = new Error('Invalid email change token');
    error.status = 400;
    throw error;
  }

  const updated = await usersDb.confirmEmailChange(record.user_id, newEmail);
  return usersDb.publicUser(updated);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
  issueTokenPair,
  verifyEmail,
  resendVerification,
  changePassword,
  requestPasswordReset,
  resetPassword,
  requestEmailChange,
  confirmEmailChange,
};
