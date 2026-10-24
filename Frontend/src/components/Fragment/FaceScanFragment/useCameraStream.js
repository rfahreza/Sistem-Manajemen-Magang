import { useRef, useEffect, useCallback, useState } from "react";

/**
 * Hook to manage webcam video streams and capture snapshots.
 *
 * @param {Object} options
 * @param {boolean} options.enabled - Whether the camera stream should be activated
 * @param {Function} [options.onVideoReady] - Callback invoked when video metadata is loaded and ready
 * @param {Function} [options.onError] - Callback invoked when camera acquisition fails
 */
export const useCameraStream = ({ enabled = true, onVideoReady, onError } = {}) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraError, setCameraError] = useState(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
          },
          audio: false,
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            if (active && videoRef.current) {
              videoRef.current.play();
              if (onVideoReady) {
                onVideoReady();
              }
            }
          };
        }
      } catch (err) {
        console.error("Gagal membuka webcam:", err);
        setCameraError(err);
        if (onError) {
          onError(err);
        }
      }
    };

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [enabled, onVideoReady, onError, stopCamera]);

  const captureSnapshot = useCallback(() => {
    if (!videoRef.current) return null;
    const snapCanvas = document.createElement("canvas");
    snapCanvas.width = videoRef.current.videoWidth || 640;
    snapCanvas.height = videoRef.current.videoHeight || 480;
    const ctx = snapCanvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, snapCanvas.width, snapCanvas.height);
    return snapCanvas.toDataURL("image/jpeg", 0.8);
  }, []);

  return {
    videoRef,
    streamRef,
    cameraError,
    captureSnapshot,
    stopCamera,
  };
};
