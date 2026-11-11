"use client";

import Link from "next/link";
import styles from "./account/verify-email/verification.module.css";

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className={styles.page}>
      <section className={styles.card} role="alert" aria-labelledby="page-error-title">
        <Link href="/" className="account-auth-brand">PONYO</Link>
        <div className={styles.heading}>
          <span className="account-auth-eyebrow">A LITTLE HICCUP</span>
          <h1 id="page-error-title">Let’s try that again.</h1>
          <p>We couldn’t load this page. Please try again in a moment. If you were placing an order, check your order history before submitting it again.</p>
        </div>
        <button className={styles.primary} onClick={() => retry()}>Try again</button>
        <Link className={styles.back} href="/">← Back to Ponyo</Link>
      </section>
    </main>
  );
}