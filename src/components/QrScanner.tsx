import { Trans } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

interface QrScannerProps {
  onDetected: (payload: string) => void;
  onStop: () => void;
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as Record<string, unknown>).BarcodeDetector;

  return typeof candidate === "function"
    ? (candidate as BarcodeDetectorConstructor)
    : null;
}

/**
 * Kamera-Scan für QR-Codes und Barcodes.
 *
 * Nutzt die native BarcodeDetector-API, wo sie vorhanden ist, und fällt sonst
 * auf jsQR zurück (nur QR). Die Kamera wird immer nach dem Scan gestoppt.
 */
export function QrScanner({ onDetected, onStop }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  // Die Callbacks des Parents wechseln bei jedem Render; fuer den
  // Kamera-Effekt zaehlt immer der aktuelle Stand, ohne ihn neu zu starten.
  const callbacksRef = useRef({ onDetected, onStop });
  callbacksRef.current = { onDetected, onStop };
  const [status, setStatus] = useState<"starting" | "scanning" | "error">(
    "starting",
  );
  const [message, setMessage] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    callbacksRef.current.onStop();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function detectWithNative(
      detector: BarcodeDetectorLike,
      video: HTMLVideoElement,
    ) {
      const results = await detector.detect(video);

      if (results.length > 0 && results[0].rawValue !== "") {
        callbacksRef.current.onDetected(results[0].rawValue);
        stop();
      }
    }

    async function detectWithJsQr(video: HTMLVideoElement) {
      const { default: jsQR } = await import("jsqr");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });

      if (context === null || canvas.width === 0 || canvas.height === 0) {
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height);

      if (result !== null && result.data !== "") {
        callbacksRef.current.onDetected(result.data);
        stop();
      }
    }

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());

          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;

        if (video === null) {
          return;
        }

        video.srcObject = stream;
        await video.play();
        setStatus("scanning");

        const Detector = barcodeDetector();

        if (Detector !== null) {
          const detector = new Detector({
            formats: ["qr_code", "ean_13", "ean_8", "code_128"],
          });

          timerRef.current = window.setInterval(() => {
            detectWithNative(detector, video).catch(() => {
              // Einzelne Fehlversuche (z. B. während des Fokus) ignorieren.
            });
          }, 350);
        } else {
          timerRef.current = window.setInterval(() => {
            detectWithJsQr(video).catch((error: unknown) => {
              setMessage(error instanceof Error ? error.message : String(error));
            });
          }, 400);
        }
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }

    start().catch((error: unknown) => {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : String(error));
    });

    return () => {
      cancelled = true;

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-box bg-base-300">
        <video
          ref={videoRef}
          className="aspect-square w-full object-cover"
          muted
          playsInline
        />
        {status === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-300/80">
            <span className="loading loading-spinner loading-lg" aria-hidden="true" />
          </div>
        )}
      </div>

      {status === "scanning" && (
        <p className="text-sm opacity-70" role="status">
          <Trans>QR-Code oder Barcode in den Rahmen halten.</Trans>
        </p>
      )}

      {status === "error" && (
        <div role="alert" className="alert alert-error alert-soft">
          <span>
            <Trans>Kamera nicht verfügbar.</Trans>
            {message !== null && <span className="block text-xs">{message}</span>}
          </span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-sm" onClick={stop}>
          <Trans>Abbrechen</Trans>
        </button>
      </div>
    </div>
  );
}
