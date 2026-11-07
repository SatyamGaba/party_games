import { useEffect, useState } from "react";
import QRCode from "qrcode";
/** Renders `value` as a scannable QR code using the `qrcode` library. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(value, { width: size * 2, margin: 1 })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(""));
    return () => {
      live = false;
    };
  }, [value, size]);
  if (!src) return null;
  return (
    <img
      className="qr-code"
      src={src}
      width={size}
      height={size}
      alt="QR code to join this game"
    />
  );
}
