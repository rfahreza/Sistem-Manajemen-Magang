import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as faceapi from "@vladmandic/face-api";
import axios from "axios";
import Swal from "sweetalert2";
import { CircularProgress } from "@mui/material";
import Background from "../../components/Elements/Items/bg";
import Logo from "../../components/Elements/Logo/Logo";
import { Camera, RefreshCw, ArrowLeft, Loader2, CheckCircle, AlertCircle, Scan } from "lucide-react";

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";
const API_URL = "http://localhost:3000";

function ScanFacePage() {
  const [status, setStatus] = useState("loading_models"); // loading_models | ready | processing | cooldown | error
  const [statusText, setStatusText] = useState("Memuat model wajah…");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeDescriptors, setActiveDescriptors] = useState([]);
  const [geoPosition, setGeoPosition] = useState(null);

  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  
  const activeDescriptorsRef = useRef([]);
  const statusRef = useRef("loading_models");
  const processingRef = useRef(false);
  const requestRef = useRef(null);

  // Sync ref with state so the requestAnimationFrame loop can read the latest values
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    activeDescriptorsRef.current = activeDescriptors;
  }, [activeDescriptors]);

  // ── Play audio sound (success / error) ────────────────────────────────────
  const playSound = (type) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      if (type === "success") {
        oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
      } else if (type === "error") {
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
      }

      setTimeout(() => {
        gainNode.disconnect();
        oscillator.disconnect();
      }, 1000);
    } catch (_) {
      // AudioContext not supported or blocked
    }
  };

  // ── Geolocation ────────────────────────────────────────────────────────────
  const fetchLocation = useCallback(async () => {
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        });
      });
      setGeoPosition(position);
      return position;
    } catch (err) {
      console.warn("Error fetching geolocation:", err);
      return null;
    }
  }, []);

  // ── Stop Camera Stream ─────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  // ── Fetch Descriptors ──────────────────────────────────────────────────────
  const fetchDescriptors = async () => {
    try {
      setStatusText("Mengambil data wajah terdaftar…");
      const response = await axios.get(`${API_URL}/api/user/face-descriptors`);
      if (response.data.success) {
        setActiveDescriptors(response.data.data);
      } else {
        throw new Error("Gagal mengambil data deskriptor wajah");
      }
    } catch (err) {
      console.error("Fetch descriptors error:", err);
      throw new Error("Gagal memuat database wajah. Silakan coba lagi.");
    }
  };

  // ── Load face-api Models ───────────────────────────────────────────────────
  const loadModelsAndData = async () => {
    try {
      setStatus("loading_models");
      setStatusText("Memuat model deteksi wajah…");
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      setStatusText("Memuat model landmark wajah…");
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      setStatusText("Memuat model pengenalan wajah…");
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      
      // Load active face descriptors database
      await fetchDescriptors();

      // Pre-fetch location
      await fetchLocation();

      // Start the camera
      await startCamera();
    } catch (err) {
      console.error("Init error:", err);
      setErrorMsg(err.message || "Terjadi kesalahan saat memuat halaman.");
      setStatus("error");
    }
  };

  // ── Start Camera ───────────────────────────────────────────────────────────
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
      setStatus("ready");
      setStatusText("Silakan hadapkan wajah Anda ke kamera.");
    } catch (err) {
      console.error("Camera access error:", err);
      setErrorMsg("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.");
      setStatus("error");
    }
  };

  // ── SweetAlert Notifications ───────────────────────────────────────────────
  const showSuccessAlert = async (data) => {
    const timeString = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    await Swal.fire({
      html: `
        <div class="max-w-md mx-auto">
          <div class="mb-6 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
              <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 mb-2">
              Absensi ${data.type === "masuk" ? "Masuk" : "Pulang"} Berhasil!
            </h2>
            <p class="text-gray-600">
              ${new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>

          <div class="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Nama</span>
                <span class="font-semibold text-gray-900">${data.nama}</span>
              </div>
              
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Waktu</span>
                <span class="font-semibold text-gray-900">${timeString} WIB</span>
              </div>

              ${
                data.type === "masuk"
                  ? `
                <div class="flex items-center justify-between py-2 border-b border-gray-100">
                  <span class="text-gray-600">Status</span>
                  <span class="px-3 py-1 rounded-full text-sm font-medium ${
                    data.status === "tepat_waktu"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }">
                    ${data.status === "tepat_waktu" ? "Tepat Waktu" : "Terlambat"}
                  </span>
                </div>
              `
                  : ""
              }

              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Lokasi</span>
                <span class="px-3 py-1 rounded-full text-sm font-medium ${
                  data.dalam_radius
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }">
                  ${data.dalam_radius ? "Dalam Radius" : "Di Luar Radius"}
                </span>
              </div>
            </div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      allowOutsideClick: false,
      customClass: {
        popup: "rounded-lg",
      },
    });
  };

  const showErrorAlert = async (message) => {
    await Swal.fire({
      html: `
        <div class="max-w-md mx-auto">
          <div class="mb-6 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 class="text-2xl font-bold text-gray-900 mb-2">
              Gagal Melakukan Absensi
            </h2>
            <p class="text-gray-600">
              ${new Date().toLocaleDateString("id-ID", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
  
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Waktu</span>
                <span class="font-semibold text-gray-900">
                  ${new Date().toLocaleTimeString("id-ID", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })} WIB
                </span>
              </div>
  
              <div class="flex items-center justify-between py-2 border-b border-gray-100">
                <span class="text-gray-600">Status</span>
                <span class="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                  Gagal
                </span>
              </div>
  
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Keterangan</span>
                <span class="text-right text-red-600 font-medium max-w-[200px]">${message}</span>
              </div>
            </div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true,
      allowOutsideClick: false,
      customClass: {
        popup: "rounded-lg",
      },
    });
  };

  // ── Absensi POST handler ──────────────────────────────────────────────────
  const handleAttendance = async (mahasiswaId) => {
    processingRef.current = true;
    setStatus("processing");
    setStatusText("Memproses absensi wajah Anda…");

    try {
      // 1. Dapatkan lokasi terbaru
      let pos = geoPosition;
      if (!pos) {
        pos = await fetchLocation();
      }
      if (!pos) {
        throw new Error("Gagal mendapatkan lokasi. Pastikan GPS aktif dan izin lokasi diberikan.");
      }

      // 2. Kirim request ke backend
      const requestData = {
        mahasiswa_id: mahasiswaId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        deviceInfo: JSON.stringify({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
        }),
      };

      const response = await fetch(`${API_URL}/api/absen/face-scan`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Gagal memproses absensi");
      }

      if (result.success) {
        playSound("success");
        await showSuccessAlert(result.data);
      } else {
        throw new Error(result.message || "Gagal memproses absensi");
      }
    } catch (error) {
      console.error("Attendance scan error:", error);
      playSound("error");
      await showErrorAlert(error.message || "Terjadi kesalahan koneksi ke server.");
    } finally {
      // Cooldown 3 seconds before next scan
      setStatus("cooldown");
      setStatusText("Siap dalam 3 detik…");
      setTimeout(() => {
        processingRef.current = false;
        if (statusRef.current !== "error") {
          setStatus("ready");
          setStatusText("Silakan hadapkan wajah Anda ke kamera.");
        }
      }, 3000);
    }
  };

  // ── Custom Glowing Box Canvas Drawer ──────────────────────────────────────
  const drawTechyBox = (ctx, box, videoWidth, videoHeight) => {
    const { x, y, width, height } = box;
    
    // Clear canvas
    ctx.clearRect(0, 0, videoWidth, videoHeight);
    
    // Set glow style (Emerald Green / Cyan)
    ctx.strokeStyle = "#10B981"; 
    ctx.lineWidth = 3;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#10B981";
    
    // Corner accent length
    const len = Math.min(width, height) * 0.15;
    
    // Top-left
    ctx.beginPath();
    ctx.moveTo(x + len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + len);
    ctx.stroke();
    
    // Top-right
    ctx.beginPath();
    ctx.moveTo(x + width - len, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + len);
    ctx.stroke();
    
    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(x + len, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + height - len);
    ctx.stroke();
    
    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(x + width - len, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - len);
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
  };

  // ── Detection Frame Loop ───────────────────────────────────────────────────
  const processFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || video.paused || video.ended || !canvas) {
      requestRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    if (canvas.width !== displaySize.width || canvas.height !== displaySize.height) {
      canvas.width = displaySize.width;
      canvas.height = displaySize.height;
    }

    const ctx = canvas.getContext("2d");

    // Only detect if camera is active
    if (["ready", "processing", "cooldown"].includes(statusRef.current)) {
      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (detection) {
          // Fit detection coordinates to the displayed video dimensions
          const matchDimensions = { width: video.videoWidth, height: video.videoHeight };
          const resized = faceapi.resizeResults(detection, displaySize);
          const box = resized.detection.box;

          // Draw the high-tech green frame around the face
          drawTechyBox(ctx, box, displaySize.width, displaySize.height);

          // If we are ready and not currently processing/cooling down, check for matching face
          if (statusRef.current === "ready" && !processingRef.current) {
            const list = activeDescriptorsRef.current;
            let bestMatch = null;
            let minDistance = 1.0;

            for (const item of list) {
              const dist = faceapi.euclideanDistance(detection.descriptor, item.face_descriptor);
              if (dist < minDistance) {
                minDistance = dist;
                bestMatch = item;
              }
            }

            if (bestMatch && minDistance < 0.5) {
              console.log(`Matched student_id ${bestMatch.mahasiswa_id} with distance: ${minDistance}`);
              // Found match! Trigger attendance call
              handleAttendance(bestMatch.mahasiswa_id);
            }
          }
        } else {
          // Clear canvas when no face is detected
          ctx.clearRect(0, 0, displaySize.width, displaySize.height);
        }
      } catch (err) {
        console.warn("Frame detection error:", err);
      }
    } else {
      // Clear canvas for non-scan states
      ctx.clearRect(0, 0, displaySize.width, displaySize.height);
    }

    requestRef.current = requestAnimationFrame(processFrame);
  }, []);

  // ── Init & Cleanup ─────────────────────────────────────────────────────────
  useEffect(() => {
    loadModelsAndData();

    // Geolocation cache update interval (every 30s)
    const geoInterval = setInterval(fetchLocation, 30000);

    return () => {
      clearInterval(geoInterval);
      stopCamera();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Start processing loop when video is ready
  useEffect(() => {
    if (status === "ready" && videoRef.current) {
      requestRef.current = requestAnimationFrame(processFrame);
    }
  }, [status, processFrame]);

  // ── Retry ──────────────────────────────────────────────────────────────────
  const handleRetry = async () => {
    stopCamera();
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
    setErrorMsg("");
    await loadModelsAndData();
  };

  const isVideoState = ["ready", "processing", "cooldown"].includes(status);

  return (
    <div className="h-screen w-screen bg-white relative overflow-hidden flex flex-col items-center justify-center">
      <Logo />
      
      <div className="relative z-10 flex flex-col items-center justify-center px-10 w-full max-w-2xl mx-auto">
        <div className="w-full bg-white mb-4 rounded-lg shadow-xl p-8 px-12 md:px-24 pb-10 flex flex-col items-center border border-gray-100">
          <div className="w-full max-w-md">
            <h2 className="text-2xl font-semibold text-center mb-8 flex items-center justify-center gap-2 text-gray-800">
              <Scan className="text-red-500 animate-pulse" size={24} />
              Scan Wajah Absensi
            </h2>

            {/* Video Container with Mirror Effect */}
            <div className="relative mb-8 flex items-center justify-center">
              <div className="relative h-80 w-80 rounded-2xl overflow-hidden bg-gray-900 border-4 border-gray-100 shadow-inner flex items-center justify-center">
                {isVideoState && (
                  <div className="relative w-full h-full" style={{ transform: "scaleX(-1)" }}>
                    <video
                      ref={videoRef}
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    />
                  </div>
                )}

                {/* Status Overlays */}
                {!isVideoState && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 gap-3">
                    {status === "loading_models" && (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="text-red-500 animate-spin" size={48} />
                        <span className="text-gray-500 text-sm text-center font-medium">
                          {statusText}
                        </span>
                      </div>
                    )}
                    {status === "error" && (
                      <div className="flex flex-col items-center gap-3 text-center">
                        <AlertCircle className="text-red-500" size={54} />
                        <span className="text-red-600 text-sm font-semibold">
                          Error Terjadi
                        </span>
                        <span className="text-gray-500 text-xs px-4">
                          {errorMsg}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Cooldown/Processing Overlay inside mirror container (so non-mirrored overlay is styled cleanly) */}
                {status === "processing" && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
                    <div className="bg-white/95 px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 border border-gray-100">
                      <CircularProgress size={20} className="text-red-600" />
                      <span className="text-sm font-semibold text-gray-800">
                        Memproses…
                      </span>
                    </div>
                  </div>
                )}

                {status === "cooldown" && (
                  <div className="absolute inset-0 bg-emerald-950/20 backdrop-blur-[1px] flex items-center justify-center z-20 animate-fade-in">
                    <div className="bg-emerald-500 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 font-bold text-sm tracking-wide">
                      <CheckCircle size={18} />
                      Scan Berhasil!
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Status & Navigation */}
            <div className="text-center space-y-5">
              <p className={`text-sm font-medium ${status === "error" ? "text-red-500" : "text-gray-500"}`}>
                {status !== "error" ? statusText : errorMsg}
              </p>

              <div className="flex flex-col gap-3 justify-center items-center">
                {status === "error" && (
                  <button
                    onClick={handleRetry}
                    className="w-full max-w-xs py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold shadow-md flex items-center justify-center gap-2"
                  >
                    <RefreshCw size={16} />
                    Coba Lagi
                  </button>
                )}

                <button
                  onClick={() => navigate("/scan")}
                  className="w-full max-w-xs py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={16} />
                  Beralih ke Scan QR Code
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Background />
    </div>
  );
}

export default ScanFacePage;
