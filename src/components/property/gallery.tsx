"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface GalleryPhoto {
  id: string;
  url: string;
  alt: string;
}

/**
 * Photo gallery: one large image with thumbnails. Thumbnails are real
 * buttons (keyboard and screen-reader friendly) and the gallery is only
 * rendered when the listing has photos.
 */
export function Gallery({
  photos,
  label,
  thumbLabel,
}: {
  photos: GalleryPhoto[];
  label: string;
  /** Contains {n} and {total} already substituted per photo by the caller. */
  thumbLabel: string[];
}) {
  const [active, setActive] = useState(0);
  const current = photos[Math.min(active, photos.length - 1)];
  if (!current) return null;

  return (
    <section aria-label={label}>
      <div className="relative aspect-[16/10] overflow-hidden rounded-card bg-sand-100">
        <Image
          key={current.id}
          src={current.url}
          alt={current.alt}
          fill
          unoptimized
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />
      </div>
      {photos.length > 1 ? (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {photos.map((photo, index) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={thumbLabel[index]}
                aria-current={index === active ? "true" : undefined}
                className={cn(
                  "relative block aspect-[4/3] w-full overflow-hidden rounded-control bg-sand-100 ring-2 ring-transparent transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mekong-500",
                  index === active ? "ring-mekong-700" : "opacity-80 hover:opacity-100",
                )}
              >
                <Image src={photo.url} alt="" fill unoptimized sizes="120px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
