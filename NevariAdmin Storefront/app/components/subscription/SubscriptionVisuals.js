"use client";

import Image from "next/image";
import proBadgeImage from "./assets/Frame 1984078440.png";
import successSealImage from "./assets/Generated Image June 01, 2026 - 11_30AM 1.png";
import paywallSealImage from "./assets/Generated Image June 01, 2026 - 3_10PM 1.png";

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function SubscriptionProBadge({ className = "" }) {
  return (
    <span className={classNames("subscription-pro-badge", className)}>
      <Image src={proBadgeImage} alt="Pro" className="subscription-pro-badge-image" priority />
    </span>
  );
}

export function SubscriptionSealArt({ variant = "paywall", className = "" }) {
  const isSuccess = variant === "success";
  const image = isSuccess ? successSealImage : paywallSealImage;
  const alt = isSuccess ? "Gold subscription success seal" : "Gold Nevari Access seal";

  return (
    <div className={classNames("subscription-seal-wrap", className)}>
      <Image
        src={image}
        alt={alt}
        className={classNames("subscription-seal-image", isSuccess ? "is-success" : "is-paywall")}
        priority
      />
    </div>
  );
}
