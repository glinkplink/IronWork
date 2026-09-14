const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed|^typeerror:/i;

/** Map transport/browser failures to copy a contractor can act on. */
export function toUserFacingError(message: string, fallback = 'Something went wrong. Try again in a moment.'): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (NETWORK_FAILURE.test(trimmed)) {
    return 'Could not reach IronWork. Check your connection and try again.';
  }
  return trimmed;
}
