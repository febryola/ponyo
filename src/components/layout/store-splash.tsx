"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocalization } from "@/components/layout/localization-provider";

export function StoreSplash() {
  const { t } = useLocalization();
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // Keep the brand cue brief, like a marketplace handoff, rather than blocking browsing.
    const dismissTimer = window.setTimeout(() => setLeaving(true), 530);
    const removeTimer = window.setTimeout(() => {
      setVisible(false);
      window.dispatchEvent(new Event("ponyo:splash-finished"));
    }, 850);
    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className={`store-splash${leaving ? " is-leaving" : ""}`} role="status" aria-label={t("home.splash.label", "Welcome to Ponyo")}>
      <div className="store-splash-content">
        <Image className="store-splash-jellyfish" src="/ponyo-jellyfish.svg" alt="" width={96} height={96} priority />
        <strong>PONYO</strong>
        <span>{t("home.announcement", "Meet your next forever plush.")}</span>
      </div>
    </div>
  );
}
