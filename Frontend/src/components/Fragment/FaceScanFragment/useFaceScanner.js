import { useState, useRef, useCallback, useEffect } from "react";
import * as faceapi from "@vladmandic/face-api";
import { useFaceModels } from "./useFaceModels";
import { useCameraStream } from "./useCameraStream";
import { clearCanvas } from "./faceDrawingUtils";

/**
 * Main orchestrator hook for facial scanning and attendance verification.
 * Coordinates face-api model loading, webcam feed, canvas drawing, and real-time recognition loop.
 *
 * @param {Object} props
 * @param {Function} [props.onCandidateFound] - Callback when a candidate face match is found for user verification
 */
export const useFaceScanner = ({ onCandidateFound } = {}) => {
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
  const isVerifyingRef = useRef(false);

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

    if (!isProcessingRef.current && !cooldownRef.current && !isVerifyingRef.current) {
      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
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
          faceapi.matchDimensions(canvas, displaySize);
          clearCanvas(canvas);

          if (detection) {
            const resized = faceapi.resizeResults(detection, displaySize);
            const bestMatch = faceMatcherRef.current.findBestMatch(resized.descriptor);

            if (bestMatch.label !== "unknown") {
              const student = students.find(
                (s) => s.mahasiswa_id.toString() === bestMatch.label
              );

              if (student) {
                const studentName = student.nama;
                isVerifyingRef.current = true;

                setRecognizedUser({
                  name: studentName,
                  nim: student.nim || "",
                  mahasiswa_id: student.mahasiswa_id,
                });

                if (onCandidateFound) {
                  onCandidateFound({
                    mahasiswaId: student.mahasiswa_id,
                    studentName: studentName,
                    nim: student.nim || "",
                  });
                }
              }
            } else {
              setRecognizedUser(null);
            }
          } else {
            setRecognizedUser(null);
          }
        }
      } catch (e) {
        // Ignore single frame inference dropouts
      }
    }

    animationFrameRef.current = requestAnimationFrame(runDetection);
  }, [faceMatcherRef, onCandidateFound, students]);

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

  // Resume scanning after user cancels or rejects verification
  const resumeScanning = useCallback(() => {
    isVerifyingRef.current = false;
    setRecognizedUser(null);
    clearCanvas(canvasRef.current);
  }, []);

  // Cooldown timer to prevent duplicate triggers after successful attendance
  const startCooldown = useCallback(
    (durationMs = 3500) => {
      isVerifyingRef.current = false;
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
    resumeScanning,
    markProcessing: updateProcessing,
  };
};
