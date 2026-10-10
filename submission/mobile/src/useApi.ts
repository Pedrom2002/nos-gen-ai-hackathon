// The API client for the address set in the settings (demo when empty).
import { useMemo } from "react";

import { createClient, type ApiClient } from "@/api";
import { useSettings } from "@/settings";

export function useApi(): ApiClient {
  const { s } = useSettings();
  return useMemo(() => createClient(s.apiUrl), [s.apiUrl]);
}
