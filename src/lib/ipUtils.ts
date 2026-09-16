/**
 * Utility to capture real client IP address for audit and login logs.
 * Uses public IP lookup with fast timeout and fallback.
 */

let cachedIp: string | null = null;

export async function fetchClientIp(): Promise<string> {
  if (cachedIp) return cachedIp;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data && typeof data.ip === 'string') {
        cachedIp = data.ip;
        return data.ip;
      }
    }
  } catch {
    // Secondary fallback service
    try {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 2500);
      const res2 = await fetch('https://api64.ipify.org?format=json', {
        signal: controller2.signal,
      });
      clearTimeout(timeout2);
      if (res2.ok) {
        const d2 = await res2.json();
        if (d2 && typeof d2.ip === 'string') {
          cachedIp = d2.ip;
          return d2.ip;
        }
      }
    } catch {
      // Ignore network errors
    }
  }

  return 'Local / Unknown';
}
