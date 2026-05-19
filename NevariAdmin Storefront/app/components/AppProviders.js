"use client";

import { SWRConfig } from "swr";

export default function AppProviders({ children }) {
  return <SWRConfig value={{
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    refreshWhenHidden: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
    dedupingInterval: 30_000,
    focusThrottleInterval: 60_000
  }}>
    {children}
  </SWRConfig>;
}
