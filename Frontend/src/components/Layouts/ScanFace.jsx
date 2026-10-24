import React, { useState, useEffect, useRef } from "react";
import * as faceapi from "@vladmandic/face-api";
import { useNavigate, Link } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import Swal from "sweetalert2";
import Logo from "../Elements/Logo/Logo";
import { QrCode, ScanFace as ScanFaceIcon, CheckCircle2, AlertTriangle, Users } from "lucide-react";

function ScanFace() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [students, setStudents] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Memuat sistem AI...");
  const [recognizedUser, setRecognizedUser] = useState(null);

  const faceMatcherRef = useRef(null);
  const isProcessingRef = useRef(false);
  const cooldownRef = useRef(false);

  const navigate = useNavigate();

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
        oscillator.stop(audioContext.currentTime + 0.15);
      } else if (type === "error") {
        oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.25);
      }

      setTimeout(() => {
        gainNode.disconnect();
        oscillator.disconnect();
      }, 1000);
    } catch (e) {
      console.warn("AudioContext error:", e);
    }
  };

  // 1. Load Face-API models
  useEffect(() => {
    let active = true;

    const loadAll = async () => {
      try {
        const modelPath = `${import.meta.env.BASE_URL}models`;
        setStatusMessage("Mengunduh model face recognition...");

        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
          faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
          faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
        ]);

        if (!active) return;
        setIsLoadingModels(false);
        setStatusMessage("Memuat data mahasiswa terdaftar...");

        // 2. Fetch student face descriptors
        const response = await fetch("http://localhost:3000/api/absen/face-descriptors");
        const resData = await response.json();

        if (resData.success && Array.isArray(resData.data) && resData.data.length > 0) {
          setStudents(resData.data);

          // Build LabeledFaceDescriptors
          const labeledDescriptors = resData.data.map((s) => {
            return new faceapi.LabeledFaceDescriptors(
              s.mahasiswa_id.toString(),
              [new Float32Array(s.face_descriptor)]
            );
          });

          // Threshold 0.52 (semakin kecil semakin ketat)
          faceMatcherRef.current = new faceapi.FaceMatcher(labeledDescriptors, 0.52);
          setStatusMessage(`Siap! ${resData.data.length} wajah mahasiswa terdaftar.`);
        } else {
          setStatusMessage("Belum ada mahasiswa yang mendaftarkan wajah.");
        }

        setIsLoadingData(false);
      } catch (err) {
        console.error("Inisialisasi face recognition error:", err);
        if (active) {
          setIsLoadingModels(false);
          setIsLoadingData(false);
          setStatusMessage("Gagal memuat sistem face recognition.");
        }
      }
    };

    loadAll();

    return () => {
      active = false;
    };
  }, []);

  // 3. Start Camera once models & data are loaded
  useEffect(() => {
    if (isLoadingModels || isLoadingData) return;

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
            startDetectionLoop();
          };
        }
      } catch (err) {
        console.error("Gagal membuka webcam:", err);
        playSound("error");
        Swal.fire({
          icon: "error",
          title: "Kamera Tidak Terdeteksi",
          text: "Pastikan kamera terpasang dan izin kamera telah diberikan di browser.",
        });
      }
    };

    startCamera();

    return () => {
      active = false;
      stopCamera();
    };
  }, [isLoadingModels, isLoadingData]);

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  // 4. Real-time Detection Loop
  const startDetectionLoop = () => {
    const detect = async () => {
      if (
        !videoRef.current ||
        videoRef.current.paused ||
        videoRef.current.ended ||
        !faceMatcherRef.current
      ) {
        animationFrameRef.current = requestAnimationFrame(detect);
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
            faceapi.matchDimensions(canvas, displaySize);

            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);

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

                // Draw green bounding box
                const box = resized.detection.box;
                ctx.strokeStyle = "#10B981";
                ctx.lineWidth = 3;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                // Draw label background
                ctx.fillStyle = "#10B981";
                ctx.fillRect(box.x, box.y - 30, box.width, 30);
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "bold 14px sans-serif";
                ctx.fillText(`${studentName} (${confidence}%)`, box.x + 8, box.y - 10);

                // Trigger attendance
                handleAttendance(student.mahasiswa_id, studentName);
              } else {
                setRecognizedUser(null);
                // Draw yellow/red bounding box for unknown
                const box = resized.detection.box;
                ctx.strokeStyle = "#F59E0B";
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);

                ctx.fillStyle = "#F59E0B";
                ctx.fillRect(box.x, box.y - 25, box.width, 25);
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "bold 12px sans-serif";
                ctx.fillText("Wajah Tidak Dikenali", box.x + 6, box.y - 8);
              }
            } else {
              setRecognizedUser(null);
            }
          }
        } catch (e) {
          // ignore single frame detection error
        }
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    };

    detect();
  };

  // 5. Submit Attendance to Backend
  const handleAttendance = async (mahasiswaId, studentName) => {
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      // Capture snapshot
      let snapshotUrl = null;
      if (videoRef.current) {
        const snapCanvas = document.createElement("canvas");
        snapCanvas.width = videoRef.current.videoWidth || 640;
        snapCanvas.height = videoRef.current.videoHeight || 480;
        const ctx = snapCanvas.getContext("2d");
        ctx.drawImage(videoRef.current, 0, 0, snapCanvas.width, snapCanvas.height);
        snapshotUrl = snapCanvas.toDataURL("image/jpeg", 0.8);
      }

      // Get geolocation
      let position = null;
      try {
        position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
        });
      } catch (geoErr) {
        console.warn("Geolocation warning:", geoErr);
      }

      const requestData = {
        mahasiswa_id: mahasiswaId,
        latitude: position?.coords?.latitude || null,
        longitude: position?.coords?.longitude || null,
        deviceInfo: JSON.stringify({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          mode: "kiosk_face_recognition",
        }),
        photo: snapshotUrl,
      };

      const response = await fetch("http://localhost:3000/api/absen/scan-face", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Gagal memproses absensi wajah");
      }

      playSound("success");
      await showSuccessAlert(result.data, studentName);
    } catch (error) {
      playSound("error");
      await showErrorAlert(error.message || "Gagal memproses absensi wajah");
    } finally {
      // Cooldown 3.5 seconds before detecting the next student
      isProcessingRef.current = false;
      setIsProcessing(false);
      cooldownRef.current = true;
      setCooldown(true);

      setTimeout(() => {
        cooldownRef.current = false;
        setCooldown(false);
        setRecognizedUser(null);
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }, 3500);
    }
  };

  const showSuccessAlert = async (data, studentName) => {
    const timeString = new Date().toLocaleTimeString("id-ID", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const isCheckIn = data.type === "masuk";
    const statusText = isCheckIn
      ? data.status === "tepat_waktu"
        ? "Tepat Waktu"
        : "Terlambat"
      : "Selesai";

    const statusColor = isCheckIn
      ? data.status === "tepat_waktu"
        ? "bg-green-100 text-green-800"
        : "bg-yellow-100 text-yellow-800"
      : "bg-blue-100 text-blue-800";

    return Swal.fire({
      html: `
        <div class="p-4 text-center">
          <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h2 class="text-2xl font-bold text-gray-900 mb-1">
            ${isCheckIn ? "Absen Masuk Berhasil!" : "Absen Pulang Berhasil!"}
          </h2>
          <p class="text-base font-semibold text-blue-600 mb-4">
            ${data.nama || studentName}
          </p>
          <div class="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-left">
            <div class="flex justify-between">
              <span class="text-gray-500">Waktu:</span>
              <span class="font-bold text-gray-800">${timeString} WIB</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Status:</span>
              <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusColor}">${statusText}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-500">Lokasi:</span>
              <span class="font-medium ${data.dalam_radius ? "text-green-600" : "text-amber-600"}">
                ${data.dalam_radius ? "Dalam Radius Kantor" : "Luar Radius"}
              </span>
            </div>
          </div>
        </div>
      `,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      allowOutsideClick: false,
    });
  };

  const showErrorAlert = async (message) => {
    return Swal.fire({
      html: `
        <div class="p-4 text-center">
          <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </div>
          <h2 class="text-xl font-bold text-gray-900 mb-2">
            Gagal Melakukan Absensi
          </h2>
          <p class="text-sm text-red-600 font-medium">
            ${message}
          </p>
        </div>
      `,
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      allowOutsideClick: false,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden flex flex-col">
      <Logo />

      {/* Main Container */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 z-10">
        <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl p-6 sm:p-8 flex flex-col items-center border border-gray-100">
          {/* Header Title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold mb-2">
              <ScanFaceIcon size={16} /> KIOSK ABSENSI WAJAH
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-800">
              Face Recognition Scanner
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Arahkan wajah Anda ke depan kamera untuk mencatat absensi.
            </p>
          </div>

          {/* Camera Frame */}
          <div className="relative w-72 h-72 sm:w-80 sm:h-80 rounded-2xl overflow-hidden bg-gray-950 shadow-inner border-4 border-slate-200 flex items-center justify-center">
            {isLoadingModels || isLoadingData ? (
              <div className="flex flex-col items-center justify-center p-4 text-center text-white space-y-3">
                <CircularProgress size={42} style={{ color: "#3B82F6" }} />
                <span className="text-sm font-medium">{statusMessage}</span>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none transform scale-x-[-1]"
                />

                {/* Animated Scanner Grid / Target */}
                <div className="absolute inset-8 border-2 border-dashed border-white/30 rounded-2xl pointer-events-none flex items-center justify-center">
                  {cooldown ? (
                    <div className="bg-black/75 px-4 py-2 rounded-xl text-green-400 font-bold text-xs flex items-center gap-2 backdrop-blur-sm">
                      <CheckCircle2 size={16} /> Absensi Dicatat. Siap berikutnya...
                    </div>
                  ) : isProcessing ? (
                    <div className="bg-black/75 px-4 py-2 rounded-xl text-blue-400 font-bold text-xs flex items-center gap-2 backdrop-blur-sm">
                      <CircularProgress size={14} color="inherit" /> Memproses Absen...
                    </div>
                  ) : (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1 bg-black/50 text-white/90 text-xs rounded-full backdrop-blur-sm">
                      <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
                      Live
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Detection Info Banner */}
          <div className="w-full mt-5">
            {recognizedUser ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm">
                    {recognizedUser.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-800">{recognizedUser.name}</h4>
                    <p className="text-xs text-gray-500">NIM: {recognizedUser.nim || "-"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                    Akurasi {recognizedUser.confidence}%
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-gray-400" />
                  <span>Mahasiswa Terdaftar: <b>{students.length}</b></span>
                </div>
                <span>Posisikan wajah tepat di kamera</span>
              </div>
            )}
          </div>

          {/* Switch to QR Scanner Option */}
          <div className="mt-6 pt-5 border-t border-gray-100 w-full flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Punya kendala dengan kamera?
            </span>
            <Link
              to="/scan"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition"
            >
              <QrCode size={15} /> Beralih ke Scan QR
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScanFace;
