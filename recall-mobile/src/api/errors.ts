export class ApiError extends Error {
  status: number;
  code?: string;
  data?: unknown;
  existingId?: string;

  constructor(
    message: string,
    options: { status: number; code?: string; data?: unknown; existingId?: string },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
    this.existingId = options.existingId;
  }
}

export class AuthError extends ApiError {
  constructor(message: string, options: { status: number; code?: string; data?: unknown }) {
    super(message, options);
    this.name = 'AuthError';
  }
}

const STATUS_MESSAGES: Record<number, string> = {
  400: 'That request was invalid. Check the details and try again.',
  401: 'Session expired — sign in again',
  403: 'You do not have access to that.',
  404: 'Not found',
  409: 'Already saved',
  429: 'Too many requests. Wait a moment and try again.',
  503: 'Search is temporarily unavailable',
};

export function userFacingMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'email_not_verified') {
      return 'Verify your email to use Recall. Check your inbox or resend from Settings.';
    }
    if (error.code === 'rate_limited' || error.status === 429) {
      return STATUS_MESSAGES[429];
    }
    if (error.status === 503) {
      return STATUS_MESSAGES[503];
    }
    return error.message || STATUS_MESSAGES[error.status] || 'Something went wrong.';
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted')) {
      return 'The request timed out. Check your connection and retry.';
    }
    if (error.message.toLowerCase().includes('network')) {
      return 'Network error. Check your connection and retry.';
    }
    return error.message;
  }

  return 'Something went wrong.';
}

export function mapHttpError(
  data: { error?: string; message?: string; code?: string; existingId?: string } | null,
  status: number,
): ApiError {
  const code = data?.code || data?.error;
  const message =
    (status === 403 && code === 'email_not_verified'
      ? 'Verify your email to use Recall. Check your inbox or resend from Settings.'
      : data?.message || data?.error) ||
    STATUS_MESSAGES[status] ||
    `Request failed (${status})`;

  if (status === 401 || (status === 403 && code === 'email_not_verified')) {
    return new AuthError(message, { status, code, data });
  }

  return new ApiError(message, {
    status,
    code,
    data,
    existingId: data?.existingId,
  });
}
