import useSWRMutation from "swr/mutation";
import { useSWRConfig } from "swr";
import { snapshotMatchingCache, restoreSnapshots, swrMutationFetcher } from "../../lib/fetcher";
import { swrKeys } from "../../lib/swrKeys";
import { isProductRelatedKey, replaceProductCache } from "./productCache";

export function useUpdateProduct(session) {
  const { cache, mutate } = useSWRConfig();
  const key = session?.baseUrl ? swrKeys.proxy.path("/products") : null;
  const mutation = useSWRMutation(
    key,
    (_key, options) => swrMutationFetcher(swrKeys.proxy.path(options?.arg?.path || "/products"), options),
    { throwOnError: true }
  );

  async function updateProduct(productId, body, optimisticProduct = null) {
    const snapshots = optimisticProduct ? snapshotMatchingCache(cache, isProductRelatedKey) : [];
    if (optimisticProduct) {
      await mutate(isProductRelatedKey, (current) => replaceProductCache(current, optimisticProduct), { revalidate: false });
    }

    try {
      const payload = await mutation.trigger({
        session,
        method: "POST",
        body,
        path: `/products/${productId}`
      }, {
        optimisticData: undefined,
        rollbackOnError: true,
        revalidate: false
      });
      const product = payload?.data || optimisticProduct;
      if (product) {
        await mutate(isProductRelatedKey, (current) => replaceProductCache(current, product), { revalidate: false });
      }
      await mutate(isProductRelatedKey, undefined, { revalidate: true });
      return payload;
    } catch (error) {
      await restoreSnapshots(mutate, snapshots);
      throw error;
    }
  }

  return {
    ...mutation,
    updateProduct
  };
}
