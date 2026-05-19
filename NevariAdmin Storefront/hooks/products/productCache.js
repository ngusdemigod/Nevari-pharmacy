import { updateListPayload, upsertById, replaceById, removeById } from "../../lib/fetcher";
import { isProductCategoryListKey, isProductListKey, isProductTagListKey } from "../../lib/swrKeys";

export function upsertProductCache(current, product) {
  return updateListPayload(current, (list) => upsertById(list, product));
}

export function replaceProductCache(current, product) {
  return updateListPayload(current, (list) => replaceById(list, product));
}

export function removeProductCache(current, productId) {
  return updateListPayload(current, (list) => removeById(list, productId));
}

export function isProductRelatedKey(key) {
  return isProductListKey(key) || isProductCategoryListKey(key) || isProductTagListKey(key);
}
