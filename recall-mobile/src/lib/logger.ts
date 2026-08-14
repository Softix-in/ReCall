const SECRET_PATTERN = /(authorization|bearer|refresh_token|access_token|password|email)/i;

function redact(value: string): string {
  if (SECRET_PATTERN.test(value)) {
    return '[redacted]';
  }

  return value;
}

function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';
}

export const logger = {
  debug(message: string, extra?: Record<string, string>): void {
    if (!isDev()) {
      return;
    }
    if (extra) {
      console.log(redact(message), Object.fromEntries(
        Object.entries(extra).map(([key, val]) => [key, redact(String(val))]),
      ));
      return;
    }
    console.log(redact(message));
  },
  info(message: string): void {
    if (!isDev()) {
      return;
    }
    console.log(redact(message));
  },
  warn(message: string): void {
    console.warn(redact(message));
  },
  error(message: string): void {
    console.error(redact(message));
  },
};
