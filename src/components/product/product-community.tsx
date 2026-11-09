"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, useRef } from "react";
import { useEffect, useState, type FormEvent } from "react";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerProfile, type ProductReview, type ProductReviewSummary } from "@/services/ponyo-api.client";

const emptySummary: ProductReviewSummary = { averageRating: 0, reviewCount: 0, reviews: [] };

export function ProductReviews({ productId }: { productId: string }) {
  const reviewFormId = useId();
  const reviewPhotoInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<ProductReviewSummary>(emptySummary);
  const [loading, setLoading] = useState(Boolean(PONYO_API_BASE_URL));
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [checkingAccount, setCheckingAccount] = useState(Boolean(PONYO_API_BASE_URL));
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewPhotos, setReviewPhotos] = useState<Array<{ name: string; dataUrl: string }>>([]);
  const [photoMessage, setPhotoMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    void Promise.allSettled([ponyoApi.getProductReviews(productId), ponyoApi.getMe()]).then((results) => {
      if (!active) return;
      const [reviewsResult, accountResult] = results;
      if (reviewsResult.status === "fulfilled") setSummary(reviewsResult.value);
      else setError(reviewsResult.reason instanceof Error ? reviewsResult.reason.message : "Reviews are temporarily unavailable.");
      if (accountResult.status === "fulfilled") setCustomer(accountResult.value);
    }).finally(() => {
      if (active) {
        setLoading(false);
        setCheckingAccount(false);
      }
    });
    return () => { active = false; };
  }, [productId]);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const review = await ponyoApi.submitProductReview(productId, { rating, title: title.trim(), body: body.trim(), photos: reviewPhotos.map((photo) => photo.dataUrl) });
      setSummary((current) => {
        const existing = current.reviews.find((item) => item.id === review.id);
        const reviews = existing ? current.reviews.map((item) => item.id === review.id ? review : item) : [review, ...current.reviews];
        const averageRating = reviews.length ? Math.round(reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length * 10) / 10 : 0;
        return { averageRating, reviewCount: reviews.length, reviews };
      });
      setMessage("Thanks for sharing your Ponyo find!");
      setTitle("");
      setBody("");
      setRating(0);
      setReviewPhotos([]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Your review could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="product-reviews" id="product-reviews" aria-labelledby="product-reviews-title">
    <header className="product-reviews-heading">
      <div><p className="eyebrow">REAL PONYO LOVE</p><h2 id="product-reviews-title">Customer reviews</h2><p>Thoughts from the plush-loving Ponyo community.</p></div>
      <div className="product-rating-summary" aria-label={`${summary.averageRating} out of 5 stars from ${summary.reviewCount} reviews`}>
        <strong>{summary.reviewCount ? summary.averageRating.toFixed(1) : "—"}</strong>
        <span className="product-rating-stars" aria-hidden="true">{summary.reviewCount ? "★★★★★" : "☆☆☆☆☆"}</span>
        <small>{summary.reviewCount} {summary.reviewCount === 1 ? "review" : "reviews"}</small>
      </div>
    </header>

    <div className="product-review-content">
      <div className="product-review-list" aria-live="polite">
        {loading ? <p className="product-review-empty">Gathering community reviews…</p> : summary.reviews.length ? summary.reviews.map((review) => <ReviewCard key={review.id} review={review} />) : <div className="product-review-empty"><span aria-hidden="true">♡</span><strong>Be the first to review this plush</strong><p>Your note can help another plush find its forever home.</p></div>}
      </div>
      <aside className="product-review-form-card">
        <details className="product-review-form-details" id="leave-a-review">
          <summary><span><span className="eyebrow">HAVE THIS PLUSH?</span><strong>Leave a review</strong><small>Share your experience with the Ponyo community</small></span><span className="product-review-summary-icon" aria-hidden="true">＋</span></summary>
          <div className="product-review-form-body">
            <p className="product-review-form-copy">Share what you love so other plush friends know what to expect.</p>
            {checkingAccount ? <p className="product-review-empty">Checking your Ponyo account…</p> : customer ? <form id={reviewFormId} onSubmit={submitReview}>
              <fieldset className="product-review-rating"><legend>Your rating <span aria-label="required">*</span></legend><div role="group" aria-label="Choose a rating from 1 to 5">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={value <= rating ? "is-selected" : ""} aria-label={`${value} star${value === 1 ? "" : "s"}`} aria-pressed={rating === value} onClick={() => setRating(value)}>★</button>)}</div></fieldset>
                      <label>Review title <span className="product-review-optional">Optional</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="The little details I love" maxLength={140} /></label>
              <label>Your review <span className="product-review-optional">Optional</span><textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="How does your new friend feel at home?" maxLength={3000} rows={4} /></label>
              <div className="product-review-photo-field"><div><strong>Add photos</strong><small>Optional · JPEG, up to 5 MB each · 4 photos maximum</small></div><input ref={reviewPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Choose review photos (optional)" onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                const allowedFiles = files.filter((file) => file.size <= 5 * 1024 * 1024 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 4);
                const skippedFiles = files.length - allowedFiles.length;
                void Promise.allSettled(allowedFiles.map(async (file) => {
                  const dataUrl = await optimizeReviewPhoto(file);
                  return dataUrl.length <= 550_000 ? { name: file.name, dataUrl } : null;
                })).then((results) => {
                  const prepared = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
                  const failed = results.length - prepared.length;
                  setReviewPhotos(prepared);
                  setPhotoMessage(skippedFiles || failed ? `${skippedFiles + failed} photo${skippedFiles + failed === 1 ? " was" : "s were"} skipped. Choose image files under 5 MB each.` : "");
                  if (reviewPhotoInputRef.current) reviewPhotoInputRef.current.value = "";
                });
              }} />{reviewPhotos.length > 0 && <div className="product-review-photo-list">{reviewPhotos.map((photo, index) => <span key={`${photo.name}-${index}`}><Image src={photo.dataUrl} alt={`Review photo: ${photo.name}`} width={64} height={64} unoptimized /><button type="button" aria-label={`Remove ${photo.name}`} onClick={() => setReviewPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))}>×</button></span>)}</div>}</div>
              {photoMessage && <p className="product-review-hint" role="status">{photoMessage}</p>}
              {rating === 0 && <p className="product-review-hint">Choose a star rating to share your review. Photos are optional.</p>}
              {error && <p className="api-form-error" role="alert">{error}</p>}
              {message && <p className="product-form-success" role="status">{message}</p>}
              <button type="submit" className="product-review-submit" disabled={saving || rating === 0}>{saving ? "Saving your review…" : "Share my review"}<span aria-hidden="true">→</span></button>
              <small>Reviews are linked to your Ponyo account. Purchases are marked when payment is verified.</small>
            </form> : <div className="product-review-signin"><p>Sign in to share a review with the Ponyo community.</p><Link className="product-review-submit" href={`/account/login?returnTo=${encodeURIComponent(`/products/${productId}#product-reviews`)}`}>Sign in to review <span aria-hidden="true">→</span></Link></div>}
          </div>
        </details>
      </aside>
    </div>
  </section>;
}

function ReviewCard({ review }: { review: ProductReview }) {
  const date = new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(review.createdAt));
  return <article className="product-review-card">
    <header><span className="product-review-avatar" aria-hidden="true">{review.reviewerName.slice(0, 1).toUpperCase()}</span><div><strong>{review.reviewerName}</strong><small>{date}</small></div><span className="product-rating-stars" aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span></header>
    {review.verifiedPurchase && <span className="product-verified-purchase">✓ Verified purchase</span>}
    {review.title && <h3>{review.title}</h3>}{review.body && <p>{review.body}</p>}
    {review.photos?.length > 0 && <div className="product-review-card-photos" aria-label="Customer review photos">{review.photos.map((photo, index) => <Image key={index} src={photo} alt={`Customer photo ${index + 1}`} width={112} height={112} unoptimized />)}</div>}
  </article>;
}

async function optimizeReviewPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This photo could not be prepared.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("This photo could not be prepared.")), "image/jpeg", 0.72));
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("This photo could not be prepared."));
    reader.readAsDataURL(blob);
  });
}

export function ProductWaitlistForm({ productId, productName }: { productId: string; productName: string }) {
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [checkingAccount, setCheckingAccount] = useState(Boolean(PONYO_API_BASE_URL));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    ponyoApi.getMe().then((profile) => {
      if (!active) return;
      setFirstName(profile.firstName);
      setEmail(profile.email);
    }).catch(() => {
      // Guests can still join the waitlist with their own contact details.
    }).finally(() => { if (active) setCheckingAccount(false); });
    return () => { active = false; };
  }, []);

  async function joinWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await ponyoApi.joinProductWaitlist(productId, { email: email.trim(), firstName: firstName.trim() });
      setMessage(`You’re on the ${productName} waitlist. We’ll email you when it’s available.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We couldn't save your waitlist request.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="product-waitlist" aria-labelledby="product-waitlist-title">
    <div className="product-waitlist-art" aria-hidden="true"><span>✦</span><span>♡</span></div>
    <p className="eyebrow">A LITTLE HEADS-UP</p>
    <h2 id="product-waitlist-title">Join the waitlist</h2>
    <p>Leave your details and we’ll save your spot for when {productName} is ready.</p>
    <form onSubmit={joinWaitlist}>
      <label>Your name<input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" placeholder="Your name" maxLength={120} disabled={checkingAccount} /></label>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required maxLength={320} disabled={checkingAccount} /></label>
      {error && <p className="api-form-error" role="alert">{error}</p>}
      {message && <p className="product-form-success" role="status">{message}</p>}
      <button className="product-review-submit" type="submit" disabled={saving || checkingAccount}>{checkingAccount ? "Checking your account…" : saving ? "Saving your spot…" : "Notify me when it’s here"}<span aria-hidden="true">→</span></button>
    </form>
    {checkingAccount && <small>Your Ponyo details will fill in automatically. You can edit them.</small>}
  </section>;
}
