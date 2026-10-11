// The API client: the address typed in the settings or, when empty, the
// automatic one (see address.ts); demo mode when there is neither.
import { useMemo } from "react";

import { appDefaultApiUrl } from "@/address";
import { createClient, type ApiClient } from "@/api";
import { useSettings } from "@/settings";

export function useApi(): ApiClient {
  const { s } = useSettings();
  return useMemo(() => createClient(s.apiUrl || appDefaultApiUrl()), [s.apiUrl]);
}
