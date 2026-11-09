export default function ProductDetailLoading() {
  return (
    <section className="product-loading store-container" role="status" aria-label="Loading product details">
      <span className="sr-only">Loading plush details…</span>
      <div className="product-loading-image" />
      <div className="product-loading-copy">
        <div className="product-loading-line product-loading-line--short" />
        <div className="product-loading-line product-loading-line--title" />
        <div className="product-loading-line product-loading-line--price" />
        <div className="product-loading-line" />
        <div className="product-loading-button" />
      </div>
    </section>
  );
}