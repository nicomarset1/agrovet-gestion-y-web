"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";

// Si la foto no carga (URL rota, archivo borrado), se muestra el envase ilustrado.
export function ProductArtImage({ alt, fallback, sizes, src }: { alt: string; fallback: ReactNode; sizes: string; src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  return (
    <Image
      alt={alt}
      className="product-art-image"
      fill
      onError={() => setFailed(true)}
      // Cubre el caso en que la foto falló antes de que React tomara el control de la página.
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailed(true);
      }}
      sizes={sizes}
      src={src}
      unoptimized
    />
  );
}
