import React, { useState, useEffect, useRef, useCallback } from "react";
import * as faceapi from "@vladmandic/face-api";
import axios from "axios";
import { X, CheckCircle, AlertCircle, Camera, Loader2 } from "lucide-react";

const MODEL_URL =
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

// Steps: 'loading_models' | 'ready' | 'capturing' | 'processing' | 'done' | 'error'

function FaceEnrollment({ onSuccess, onClose }) {
  const [step, setStep] = useState("loading_models");
  const [sampleCount, setSampleCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusText, setStatusText] = useState("Memuat model wajah…");

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const descriptorsRef = useRef([]);
  const capturingRef = useRef(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // ── helpers ──────────────────────────────────────────────────────────────
  const playSound = (type) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === "success") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      }
    } catch (_) {
      // audio not supported
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // ── lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    loadModels();
    return () => {
      clearTimers();
      stopCamera();
      capturingRef.current = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── model loading ─────────────────────────────────────────────────────────
  const loadModels = async () => {
    try {
      setStatusText("Memuat model deteksi wajah…");
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      setStatusText("Memuat model landmark wajah…");
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      setStatusText("Memuat model pengenalan wajah…");
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      await startCamera();
    } catch (err) {
      console.error("Model load error:", err);
      setErrorMsg("Gagal memuat model wajah. Periksa koneksi internet.");
      setStep("error");
    }
  };

  // ── camera ────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    try {
      setStatusText("Mengakses kamera…");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStep("ready");
      setStatusText("Hadapkan wajah ke kamera, lalu tekan 'Mulai Capture'.");
    } catch (err) {
      console.error("Camera error:", err);
      setErrorMsg(
        "Tidak dapat mengakses kamera. Pastikan izin kamera telah diberikan."
      );
      setStep("error");
    }
  };

  // ── capture loop ──────────────────────────────────────────────────────────
  const startCapture = () => {
    if (capturingRef.current) return;
    descriptorsRef.current = [];
    setSampleCount(0);
    capturingRef.current = true;
    setStep("capturing");
    setStatusText("Mendeteksi wajah…");

    // timeout after 15 seconds
    timeoutRef.current = setTimeout(() => {
      if (capturingRef.current && descriptorsRef.current.length < 5) {
        clearTimers();
        capturingRef.current = false;
        setErrorMsg(
          `Hanya ${descriptorsRef.current.length} dari 5 sampel terkumpul. Pastikan wajah terlihat jelas.`
        );
        setStep("error");
        playSound("error");
      }
    }, 15000);

    const captureLoop = async () => {
      if (!capturingRef.current || !videoRef.current) return;

      try {
        const detection = await faceapi
          .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection && capturingRef.current) {
          descriptorsRef.current.push(detection.descriptor);
          const count = descriptorsRef.current.length;
          setSampleCount(count);
          setStatusText(`Sampel ${count}/5 terkumpul…`);

          if (count >= 5) {
            capturingRef.current = false;
            clearTimers();
            await submitDescriptor();
            return;
          }
        }
      } catch (err) {
        console.warn("Detection tick error:", err);
      }

      if (capturingRef.current) {
        intervalRef.current = setTimeout(captureLoop, 500);
      }
    };

    // Start the recursive capture loop
    captureLoop();
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const submitDescriptor = async () => {
    setStep("processing");
    setStatusText("Memproses dan mendaftarkan wajah…");

    try {
      // average all collected descriptors
      const len = descriptorsRef.current[0].length;
      const avg = new Float32Array(len);
      for (const desc of descriptorsRef.current) {
        for (let i = 0; i < len; i++) avg[i] += desc[i];
      }
      for (let i = 0; i < len; i++) avg[i] /= descriptorsRef.current.length;

      const token = localStorage.getItem("token");
      await axios.post(
        "/api/user/enroll-face",
        { face_descriptor: Array.from(avg) },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      playSound("success");
      stopCamera();
      setStep("done");
      setStatusText("Wajah berhasil didaftarkan!");

      // delay so user sees the success state — stored in ref so it can be cancelled on close
      timeoutRef.current = setTimeout(() => {
        onSuccess();
      }, 1800);
    } catch (err) {
      console.error("Enroll error:", err);
      playSound("error");
      const msg =
        err?.response?.data?.message ||
        "Gagal mendaftarkan wajah. Silakan coba lagi.";
      setErrorMsg(msg);
      setStep("error");
    }
  };

  // ── retry ─────────────────────────────────────────────────────────────────
  const handleRetry = async () => {
    clearTimers();
    stopCamera();
    capturingRef.current = false;
    descriptorsRef.current = [];
    setSampleCount(0);
    setErrorMsg("");
    setStep("loading_models");
    await loadModels(); // Re-start from the very beginning (models → camera)
  };

  // ── handle close ──────────────────────────────────────────────────────────
  const handleClose = () => {
    clearTimers();
    capturingRef.current = false;
    stopCamera();
    onClose();
  };

  // ── render helpers ────────────────────────────────────────────────────────
  const progressPercent = Math.round((sampleCount / 5) * 100);

  const showVideo = ["ready", "capturing"].includes(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-85">
      <div className="relative w-full max-w-lg mx-4 bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Camera className="text-indigo-400" size={20} />
            <h2 className="text-white font-semibold text-lg">
              Pendaftaran Wajah
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors rounded-full p-1 hover:bg-gray-700"
            aria-label="Tutup"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center px-6 py-6 gap-5">
          {/* Video */}
          <div
            className={`relative rounded-xl overflow-hidden bg-gray-800 border-2 ${
              step === "capturing"
                ? "border-indigo-500"
                : step === "done"
                ? "border-green-500"
                : step === "error"
                ? "border-red-500"
                : "border-gray-600"
            } transition-colors duration-300`}
            style={{ width: "100%", aspectRatio: "4/3" }}
          >
            <video
              ref={videoRef}
              muted
              playsInline
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                showVideo ? "opacity-100" : "opacity-0"
              }`}
              style={{ transform: "scaleX(-1)" }}
            />

            {/* Overlay for non-video states */}
            {!showVideo && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                {step === "loading_models" && (
                  <Loader2 className="text-indigo-400 animate-spin" size={48} />
                )}
                {step === "processing" && (
                  <Loader2 className="text-indigo-400 animate-spin" size={48} />
                )}
                {step === "done" && (
                  <CheckCircle className="text-green-400" size={64} />
                )}
                {step === "error" && (
                  <AlertCircle className="text-red-400" size={64} />
                )}
              </div>
            )}

            {/* Capturing: face guide overlay */}
            {step === "capturing" && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div
                  className="rounded-full border-4 border-indigo-400 opacity-60"
                  style={{ width: "60%", aspectRatio: "1/1" }}
                />
              </div>
            )}
          </div>

          {/* Status text */}
          <p className="text-gray-300 text-sm text-center leading-relaxed">
            {step === "error" ? errorMsg : statusText}
          </p>

          {/* Progress bar (capturing only) */}
          {step === "capturing" && (
            <div className="w-full">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Sampel terkumpul</span>
                <span className="font-semibold text-indigo-300">
                  {sampleCount} / 5
                </span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="w-full flex flex-col gap-3">
            {step === "ready" && (
              <button
                onClick={startCapture}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Camera size={18} />
                Mulai Capture
              </button>
            )}

            {step === "done" && (
              <div className="flex items-center justify-center gap-2 py-3 bg-green-900/40 border border-green-700 text-green-400 font-semibold rounded-xl">
                <CheckCircle size={18} />
                Wajah Berhasil Didaftarkan!
              </div>
            )}

            {step === "error" && (
              <button
                onClick={handleRetry}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
              >
                Coba Lagi
              </button>
            )}

            {["loading_models", "processing"].includes(step) && (
              <div className="flex items-center justify-center gap-2 py-3 text-gray-400 text-sm">
                <Loader2 size={16} className="animate-spin" />
                {step === "loading_models"
                  ? "Memuat model…"
                  : "Mendaftarkan wajah…"}
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full py-2 text-gray-400 hover:text-white text-sm rounded-xl hover:bg-gray-800 transition-colors"
            >
              Batal / Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FaceEnrollment;
