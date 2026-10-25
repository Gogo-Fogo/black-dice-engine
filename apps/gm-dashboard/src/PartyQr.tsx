import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function PartyQr({ url }: { url: string }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let active = true;
    setImage("");
    void QRCode.toDataURL(url, { width: 288, margin: 2, errorCorrectionLevel: "M" }).then(value => { if (active) setImage(value); }).catch(() => {});
    return () => { active = false; };
  }, [url]);
  return image ? <img className="party-qr" src={image} width={288} height={288} alt="Scan to join The Midnight Bell; the same join address is printed below" /> : <p>Use the join address below if the QR code is unavailable.</p>;
}
