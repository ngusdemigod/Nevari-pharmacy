import useSWRMutation from "swr/mutation";
import { useSWRConfig } from "swr";
import { replaceById, snapshotMatchingCache, restoreSnapshots, swrMutationFetcher, updateListPayload } from "../../lib/fetcher";
import { isAdminSummaryKey, isOrderListKey, swrKeys } from "../../lib/swrKeys";

function replaceOrderCache(current, order) {
  return updateListPayload(current, (list) => replaceById(list, order));
}

export function useUpdateOrderStatus(session) {
  const { cache, mutate } = useSWRConfig();
  const key = session?.baseUrl ? swrKeys.proxy.path("/orders") : null;
  const mutation = useSWRMutation(
    key,
    (_key, options) => swrMutationFetcher(swrKeys.proxy.path(options?.arg?.path || "/orders"), options),
    { throwOnError: true }
  );

  async function updateOrderStatus(orderId, body, optimisticOrder = null) {
    const snapshots = optimisticOrder ? snapshotMatchingCache(cache, isOrderListKey) : [];
    if (optimisticOrder) {
      await mutate(isOrderListKey, (current) => replaceOrderCache(current, optimisticOrder), { revalidate: false });
    }

    try {
      const payload = await mutation.trigger({
        session,
        method: "POST",
        path: `/orders/${orderId}`,
        body
      }, {
        rollbackOnError: true,
        revalidate: false
      });
      const order = payload?.data || optimisticOrder;
      if (order) {
        await mutate(isOrderListKey, (current) => replaceOrderCache(current, order), { revalidate: false });
      }
      await Promise.all([
        mutate(isOrderListKey, undefined, { revalidate: true }),
        mutate(isAdminSummaryKey, undefined, { revalidate: true })
      ]);
      return payload;
    } catch (error) {
      await restoreSnapshots(mutate, snapshots);
      throw error;
    }
  }

  return {
    ...mutation,
    updateOrderStatus
  };
}

