import useSWRMutation from "swr/mutation";
import { useSWRConfig } from "swr";
import { removeProductCache } from "./productCache";
import { snapshotMatchingCache, restoreSnapshots, swrMutationFetcher } from "../../lib/fetcher";
import { isProductRelatedKey } from "./productCache";
import { swrKeys } from "../../lib/swrKeys";

export function useDeleteProduct(session) {
  const { cache, mutate } = useSWRConfig();
  const key = session?.baseUrl ? swrKeys.proxy.path("/products") : null;
  const mutation = useSWRMutation(
    key,
    (_key, options) => swrMutationFetcher(swrKeys.proxy.path(options?.arg?.path || "/products"), options),
    { throwOnError: true }
  );

  async function deleteProduct(productId) {
    const snapshots = snapshotMatchingCache(cache, isProductRelatedKey);
    await mutate(isProductRelatedKey, (current) => removeProductCache(current, productId), { revalidate: false });

    try {
      const payload = await mutation.trigger({
        session,
        method: "DELETE",
        path: `/products/${productId}`
      }, {
        rollbackOnError: true,
        revalidate: false
      });
      await mutate(isProductRelatedKey, undefined, { revalidate: true });
      return payload;
    } catch (error) {
      await restoreSnapshots(mutate, snapshots);
      throw error;
    }
  }

  return {
    ...mutation,
    deleteProduct
  };
}

