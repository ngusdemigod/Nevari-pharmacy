import useSWR, { mutate } from "swr";

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function ProductsList() {
  const {
    data,
    error,
    isLoading
  } = useSWR("/api/admin/products?page=1&per_page=20", fetcher);

  async function deleteProduct(productId: number) {
    await fetch(`/api/admin/products/${productId}`, {
      method: "DELETE"
    });

    mutate("/api/admin/products?page=1&per_page=20");
  }

  if (isLoading) return <p>Loading products...</p>;
  if (error) return <p>Failed to load products</p>;

  return (
    <div>
      {data?.products?.map((product: any) => (
        <div key={product.id}>
          {product.name}
          <button onClick={() => deleteProduct(product.id)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}