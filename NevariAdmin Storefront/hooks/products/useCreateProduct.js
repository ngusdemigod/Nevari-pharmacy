import useSWRMutation from "swr/mutation";
import { useSWRConfig } from "swr";
import { swrMutationFetcher } from "../../lib/fetcher";
import { swrKeys } from "../../lib/swrKeys";
import { isProductRelatedKey, upsertProductCache } from "./productCache";

export function useCreateProduct(session) {
  const { mutate } = useSWRConfig();
  const key = session?.baseUrl ? swrKeys.proxy.path("/products") : null;
  const mutation = useSWRMutation(key, swrMutationFetcher, {
    throwOnError: true,
    onSuccess(payload) {
      const product = payload?.data;
      if (product) {
        mutate(isProductRelatedKey, (current) => upsertProductCache(current, product), { revalidate: false });
      }
      mutate(isProductRelatedKey, undefined, { revalidate: true });
    }
  });

  return {
    ...mutation,
    createProduct: (body) => mutation.trigger({ session, method: "POST", body })
  };
}

