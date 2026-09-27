import { cookies } from 'next/headers';

export const COOKIE_NAME = 'bumin_last_visit';

/**
 * Reads the last visit timestamp from cookies.
 * Returns null if the cookie does not exist.
 * Must be called in a Server Component.
 */
export async function getLastVisit(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}
