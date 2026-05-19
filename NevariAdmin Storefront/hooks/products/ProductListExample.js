"use client";

import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from ".";

export function ProductListExample({ session, search = "" }) {
  const { data, error, isLoading } = useProducts(session, { page: 1, perPage: 20, search });
  const { createProduct, isMutating: isCreating } = useCreateProduct(session);
  const { updateProduct, isMutating: isUpdating } = useUpdateProduct(session);
  const { deleteProduct, isMutating: isDeleting } = useDeleteProduct(session);
  const products = data?.data || [];

  if (isLoading) {
    return <p>Loading products...</p>;
  }

  if (error) {
    return <p>{error.message}</p>;
  }

  return (
    <section>
      <button
        type="button"
        disabled={isCreating}
        onClick={() => createProduct({ name: "New product", regular_price: "0", catalog_visibility: "visible" })}
      >
        Create product
      </button>
      {products.map((product) => (
        <article key={product.id}>
          <strong>{product.name}</strong>
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => updateProduct(product.id, { status: product.status === "publish" ? "draft" : "publish" }, { ...product, status: product.status === "publish" ? "draft" : "publish" })}
          >
            Toggle status
          </button>
          <button type="button" disabled={isDeleting} onClick={() => deleteProduct(product.id)}>
            Delete
          </button>
        </article>
      ))}
    </section>
  );
}

