import useSWR from "swr";
import { swrJsonFetcher } from "../../lib/fetcher";
import { swrKeys, withBaseUrl } from "../../lib/swrKeys";

export function useProducts(session, { page = 1, perPage = 20, search = "", status = "" } = {}) {
  const params = withBaseUrl(session, {
    page,
    per_page: perPage,
    search,
    status
  });
  const key = session?.accessToken && session?.baseUrl ? swrKeys.admin.products(params) : null;

  return useSWR(
    key,
    (cacheKey) => swrJsonFetcher(cacheKey, { session }),
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 120000
    }
  );
}

