import { useState, useRef, useCallback, useEffect } from "react";
import * as faceapi from "@vladmandic/face-api";
import { useFaceModels } from "./useFaceModels";
import { useCameraStream } from "./useCameraStream";
import { drawDetectionResult, clearCanvas } from "./faceDrawingUtils";

/**
 * Main orchestrator hook for facial scanning and attendance verification.
 * Coordinates face-api model loading, webcam feed, canvas drawing, and real-time recognition loop.
 *
 * @param {Object} props
 * @param {Function} [props.onMatch] - Callback when a recognized face is matched
 */
export const useFaceScanner = ({ onMatch } = {}) => {
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);

  // 1. Manage models & registered student descriptors
  const {
    isLoadingModels,
    isLoadingData,
    students,
    statusMessage,
    setStatusMessage,
    faceMatcherRef,
  } = useFaceModels();

  // State flags for recognition and attendance processing
  const [recognizedUser, setRecognizedUser] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const isProcessingRef = useRef(false);
  const cooldownRef = useRef(false);

  // Sync refs with states to prevent stale closures in requestAnimationFrame loop
  const updateProcessing = useCallback((processing) => {
    isProcessingRef.current = processing;
    setIsProcessing(processing);
  }, []);

  const updateCooldown = useCallback((inCooldown) => {
    cooldownRef.current = inCooldown;
    setCooldown(inCooldown);
  }, []);

  // 2. Real-time Detection Loop
  const stopDetectionLoop = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const runDetection = useCallback(async () => {
    if (
      !videoRef.current ||
      videoRef.current.paused ||
      videoRef.current.ended ||
      !faceMatcherRef.current
    ) {
      animationFrameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    if (!isProcessingRef.current && !cooldownRef.current) {
      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5,
        });

        const detection = await faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks()
          .withFaceDescriptor();

        const canvas = canvasRef.current;
        if (canvas && videoRef.current) {
          const displaySize = {
            width: videoRef.current.videoWidth || 640,
            height: videoRef.current.videoHeight || 480,
          };

          if (detection) {
            const resized = faceapi.resizeResults(detection, displaySize);
            const bestMatch = faceMatcherRef.current.findBestMatch(resized.descriptor);

            if (bestMatch.label !== "unknown") {
              const student = students.find(
                (s) => s.mahasiswa_id.toString() === bestMatch.label
              );
              const studentName = student ? student.nama : `ID: ${bestMatch.label}`;
              const confidence = Math.round((1 - bestMatch.distance) * 100);

              setRecognizedUser({
                name: studentName,
                nim: student?.nim || "",
                confidence,
              });

              drawDetectionResult(canvas, displaySize, resized.detection.box, {
                name: studentName,
                confidence,
                isMatched: true,
              });

              if (onMatch && student) {
                onMatch(student.mahasiswa_id, studentName);
              }
            } else {
              setRecognizedUser(null);
              drawDetectionResult(canvas, displaySize, resized.detection.box, {
                isMatched: false,
              });
            }
          } else {
            setRecognizedUser(null);
            clearCanvas(canvas);
          }
        }
      } catch (e) {
        // Ignore single frame inference dropouts
      }
    }

    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [faceMatcherRef, onMatch, students]);

  // 3. Manage webcam stream
  const isCameraEnabled = !isLoadingModels && !isLoadingData;
  const { videoRef, captureSnapshot, stopCamera } = useCameraStream({
    enabled: isCameraEnabled,
    onVideoReady: () => {
      stopDetectionLoop();
      runDetection();
    },
    onError: () => {
      setStatusMessage("Gagal membuka kamera. Periksa izin kamera.");
    },
  });

  // Cleanup detection loop on unmount
  useEffect(() => {
    return () => {
      stopDetectionLoop();
      stopCamera();
    };
  }, [stopDetectionLoop, stopCamera]);

  // Cooldown timer to prevent duplicate triggers
  const startCooldown = useCallback(
    (durationMs = 3500) => {
      updateProcessing(false);
      updateCooldown(true);

      setTimeout(() => {
        updateCooldown(false);
        setRecognizedUser(null);
        clearCanvas(canvasRef.current);
      }, durationMs);
    },
    [updateProcessing, updateCooldown]
  );

  return {
    videoRef,
    canvasRef,
    isLoadingModels,
    isLoadingData,
    statusMessage,
    students,
    recognizedUser,
    isProcessing,
    cooldown,
    captureSnapshot,
    startCooldown,
    markProcessing: updateProcessing,
  };
};
