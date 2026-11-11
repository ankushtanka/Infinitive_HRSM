/**
 * Utility to sanitize server errors returned to client API responses.
 * Prevents exposing raw database traces, SMTP credentials, or stack traces in production.
 */
export function getSafeErrorMessage(error: any, fallbackMessage: string): string {
  if (process.env.NODE_ENV === 'production') {
    return fallbackMessage;
  }
  return error && typeof error.message === 'string' && error.message.trim()
    ? error.message
    : fallbackMessage;
}
