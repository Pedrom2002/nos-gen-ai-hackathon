// Where the API is when nobody typed an address in the settings:
// 1. EXPO_PUBLIC_API_URL, set on the computer that runs `expo start`
//    (submission/mobile/.env.local, not committed);
// 2. on the same Wi-Fi, port 8000 of the computer that served the app;
// 3. otherwise demo mode ("").
import Constants from "expo-constants";

import { normalizeBase } from "@/api";

const PRIVATE_IP = /^(10\.\d+|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/;

/** The default address from the computer's setting or the dev server host. */
export function defaultApiUrl(fromEnv: string | undefined, hostUri: string | undefined): string {
  if (fromEnv?.trim()) return normalizeBase(fromEnv);
  const host = hostUri?.split(":")[0] ?? "";
  // Only a private address means "same network": never guess a public host.
  return PRIVATE_IP.test(host) ? `http://${host}:8000` : "";
}

export function appDefaultApiUrl(): string {
  return defaultApiUrl(process.env.EXPO_PUBLIC_API_URL, Constants.expoConfig?.hostUri);
}
