import React, { useState, useEffect, useRef } from "react";
import * as faceapi from "@vladmandic/face-api";
import { Camera, CheckCircle, AlertCircle, RefreshCw, X } from "lucide-react";
import Swal from "sweetalert2";

const FaceEnrollmentModal = ({ isOpen, onClose, onSuccess }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState("Memuat model AI...");
  const [isSaving, setIsSaving] = useState(false);
  const [capturedDescriptor, setCapturedDescriptor] = useState(null);
  const [previewSnapshot, setPreviewSnapshot] = useState(null);
  const animationFrameRef = useRef(null);

  // Load models on mount
  useEffect(() => {
    let isMounted = true;

    const loadModels = async () => {
      try {
        const modelPath = `${import.meta.env.BASE_URL}models`;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
        ]);
        if (isMounted) {
          setModelLoading(false);
          setDetectionMessage("Model AI siap. Menyalakan kamera...");
        }
      } catch (err) {
        console.error("Gagal memuat model face-api:", err);
        if (isMounted) {
          setModelLoading(false);
          setDetectionMessage("Gagal memuat model pendeteksi wajah.");
        }
      }
    };

    if (isOpen) {
      loadModels();
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Start / Stop camera when open
  useEffect(() => {
    if (!isOpen || modelLoading) return;

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
            videoRef.current.play();
            setIsDetecting(true);
            setDetectionMessage("Posisikan wajah Anda di tengah lingkaran...");
          };
        }
      } catch (err) {
        console.error("Gagal mengakses webcam:", err);
        setDetectionMessage("Gagal membuka kamera. Periksa izin kamera.");
      }
    };

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isOpen, modelLoading]);

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsDetecting(false);
  };

  // Continuous face detection loop
  useEffect(() => {
    if (!isDetecting || !videoRef.current || previewSnapshot) return;

    let isRunning = true;

    const detectLoop = async () => {
      if (!isRunning || !videoRef.current || videoRef.current.paused || videoRef.current.ended) {
        return;
      }

      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 320,
          scoreThreshold: 0.5,
        });

        const detection = await faceapi
          .detectSingleFace(videoRef.current, options)
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          setFaceDetected(true);
          setDetectionMessage("Wajah terdeteksi! Tahan posisi stabil...");
        } else {
          setFaceDetected(false);
          setDetectionMessage("Arahkan wajah Anda lurus ke kamera.");
        }
      } catch (error) {
        // silent error on single frame
      }

      if (isRunning) {
        animationFrameRef.current = requestAnimationFrame(detectLoop);
      }
    };

    detectLoop();

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isDetecting, previewSnapshot]);

  // Capture face descriptor and preview
  const handleCapture = async () => {
    if (!videoRef.current) return;

    try {
      setIsSaving(true);
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 416,
        scoreThreshold: 0.6,
      });

      const detection = await faceapi
        .detectSingleFace(videoRef.current, options)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        Swal.fire({
          icon: "warning",
          title: "Wajah Belum Terdeteksi",
          text: "Pastikan pencahayaan cukup dan wajah Anda menghadap langsung ke kamera.",
        });
        setIsSaving(false);
        return;
      }

      // Capture screenshot
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const snapshotUrl = canvas.toDataURL("image/jpeg", 0.85);

      setPreviewSnapshot(snapshotUrl);
      setCapturedDescriptor(Array.from(detection.descriptor));
      stopCamera();
    } catch (err) {
      console.error("Error capturing face:", err);
      Swal.fire({
        icon: "error",
        title: "Gagal Mengambil Wajah",
        text: "Terjadi kesalahan saat memproses wajah. Silakan coba lagi.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetake = () => {
    setPreviewSnapshot(null);
    setCapturedDescriptor(null);
    setFaceDetected(false);
    setIsDetecting(true);
  };

  const handleSaveToBackend = async () => {
    if (!capturedDescriptor || capturedDescriptor.length !== 128) {
      Swal.fire({
        icon: "error",
        title: "Data Tidak Valid",
        text: "Descriptor wajah tidak lengkap. Silakan ambil ulang.",
      });
      return;
    }

    try {
      setIsSaving(true);
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:3000/api/user/face-register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          descriptor: capturedDescriptor,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal menyimpan data wajah");
      }

      await Swal.fire({
        icon: "success",
        title: "Pendaftaran Wajah Berhasil!",
        text: "Data wajah Anda telah tersimpan dan siap digunakan untuk absensi kiosk.",
        timer: 2000,
        showConfirmButton: false,
      });

      if (onSuccess) onSuccess();
      handleClose();
    } catch (error) {
      console.error("Save face error:", error);
      Swal.fire({
        icon: "error",
        title: "Gagal Menyimpan",
        text: error.message || "Terjadi kesalahan saat menyimpan wajah ke server.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    stopCamera();
    setPreviewSnapshot(null);
    setCapturedDescriptor(null);
    setFaceDetected(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-800">
              Pendaftaran Wajah (Face Recognition)
            </h3>
            <p className="text-xs text-gray-500">
              Wajah ini akan digunakan untuk absensi di scanner kantor.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Video / Snapshot Area */}
        <div className="p-6 flex flex-col items-center">
          <div className="relative w-80 h-80 rounded-2xl overflow-hidden bg-gray-900 border-4 shadow-inner flex items-center justify-center transition-all duration-300 border-gray-200">
            {modelLoading ? (
              <div className="flex flex-col items-center text-white space-y-3">
                <RefreshCw size={36} className="animate-spin text-blue-400" />
                <span className="text-sm font-medium">Memuat model AI...</span>
              </div>
            ) : previewSnapshot ? (
              <img
                src={previewSnapshot}
                alt="Face Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                {/* Face Oval Guide */}
                <div
                  className={`absolute w-52 h-64 border-2 border-dashed rounded-full pointer-events-none transition-colors duration-300 ${
                    faceDetected
                      ? "border-green-400 shadow-[0_0_20px_rgba(74,222,128,0.4)]"
                      : "border-white/50"
                  }`}
                />
              </>
            )}

            {/* Status indicator on top of video */}
            {!modelLoading && !previewSnapshot && (
              <div className="absolute top-3 inset-x-3 flex justify-center">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md shadow-sm ${
                    faceDetected
                      ? "bg-green-500/90 text-white"
                      : "bg-black/60 text-gray-200"
                  }`}
                >
                  {faceDetected ? (
                    <CheckCircle size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                  <span>{detectionMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* Guide Tips */}
          <div className="mt-4 text-xs text-gray-500 text-center max-w-sm space-y-1">
            <p>• Lepaskan masker atau kacamata gelap saat memindai.</p>
            <p>• Pastikan ruangan memiliki pencahayaan yang cukup.</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition"
          >
            Batal
          </button>

          {previewSnapshot ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                disabled={isSaving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100 transition flex items-center gap-1.5"
              >
                <RefreshCw size={16} /> Ambil Ulang
              </button>
              <button
                type="button"
                onClick={handleSaveToBackend}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md hover:shadow-lg transition flex items-center gap-1.5"
              >
                {isSaving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} /> Simpan Wajah
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCapture}
              disabled={modelLoading || !faceDetected || isSaving}
              className={`px-5 py-2 text-sm font-medium text-white rounded-lg shadow-md transition flex items-center gap-1.5 ${
                faceDetected && !modelLoading
                  ? "bg-blue-600 hover:bg-blue-700 hover:shadow-lg"
                  : "bg-gray-300 cursor-not-allowed"
              }`}
            >
              <Camera size={16} /> Ambil Wajah
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FaceEnrollmentModal;
