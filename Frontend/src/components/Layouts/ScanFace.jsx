import React, { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../Elements/Logo/Logo";
import Background from "../Elements/Items/bg";
import WhiteButton from "../Elements/Button/WhiteButton";
import Button from "../Elements/Button/Button";

import { useFaceScanner } from "../Fragment/FaceScanFragment/useFaceScanner";
import FaceCameraFrame from "../Fragment/FaceScanFragment/FaceCameraFrame";
import FaceStatusCard from "../Fragment/FaceScanFragment/FaceStatusCard";
import { playSound, showSuccessAlert, showErrorAlert } from "../Fragment/FaceScanFragment/faceAlerts";

function ScanFace() {
  const navigate = useNavigate();
  const [candidate, setCandidate] = useState(null);
  const timeoutRef = useRef(null);

  // Called when a face matches a registered student
  const handleCandidateFound = useCallback((candidateData) => {
    setCandidate(candidateData);
  }, []);

  // Auto-cancel verification prompt after 12 seconds if unattended
  useEffect(() => {
    if (candidate) {
      timeoutRef.current = setTimeout(() => {
        handleRejectAttendance();
      }, 12000);
    }
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [candidate]);

  const {
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
    markProcessing,
  } = useFaceScanner({ onCandidateFound: handleCandidateFound });

  // User confirmed "Ya, Benar (Absen)"
  const handleConfirmAttendance = async () => {
    if (!candidate || isProcessing) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    markProcessing(true);
    const targetCandidate = candidate;
    setCandidate(null);

    try {
      const snapshot = captureSnapshot();

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
        mahasiswa_id: targetCandidate.mahasiswaId,
        latitude: position?.coords?.latitude || null,
        longitude: position?.coords?.longitude || null,
        deviceInfo: JSON.stringify({
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          mode: "kiosk_face_recognition_verified",
        }),
        photo: snapshot,
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
      await showSuccessAlert(result.data, targetCandidate.studentName);
    } catch (error) {
      playSound("error");
      await showErrorAlert(error.message || "Gagal memproses absensi wajah");
    } finally {
      startCooldown(3500);
    }
  };

  // User clicked "Bukan Saya / Scan Ulang"
  const handleRejectAttendance = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setCandidate(null);
    resumeScanning();
  };

  const isLoading = isLoadingModels || isLoadingData;

  return (
    <div className="h-screen bg-white relative overflow-hidden">
      <Logo />

      <div className="bg-white relative overflow-hidden flex flex-col items-center justify-center">
        <div className="relative z-10 flex flex-col items-center justify-center px-10">
          <div className="max-w-2xl w-full mx-auto justify-center bg-white mb-4 rounded-lg shadow-xl p-8 px-24 pb-10 flex flex-col items-center">
            <div className="max-w-md w-full">
              <h2 className="text-2xl font-semibold text-center mb-8">
                Absensi Wajah
              </h2>

              {/* Camera Frame & Canvas Overlay */}
              <FaceCameraFrame
                videoRef={videoRef}
                canvasRef={canvasRef}
                isLoading={isLoading}
                statusMessage={statusMessage}
                cooldown={cooldown}
                isProcessing={isProcessing}
              />

              {/* Interactive Verification Prompt */}
              {candidate ? (
                <div className="w-full mb-6 p-4 bg-white text-black border border-gray rounded-xl text-center shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-lg mx-auto mb-2 shadow-sm">
                    {candidate.studentName.charAt(0)}
                  </div>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    Wajah Terdeteksi
                  </p>
                  <h3 className="text-base font-bold text-gray-900 mt-0.5">
                    {candidate.studentName}
                  </h3>
                  <p className="text-xs text-gray-600 mb-3">NIM: {candidate.nim || "-"}</p>

                  <p className="text-xs font-semibold text-gray-700 mb-3">
                    Apakah benar data ini sesuai dengan Anda?
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      variant="w-full bg-green-600 hover:bg-green-700 text-xs font-semibold py-2"
                      onClick={handleConfirmAttendance}
                    >
                      Benar
                    </Button>
                    <WhiteButton
                      variant="w-full text-xs font-semibold py-2"
                      onClick={handleRejectAttendance}
                    >
                      Bukan Saya
                    </WhiteButton>
                  </div>
                </div>
              ) : (
                !isLoading && (
                  <FaceStatusCard
                    recognizedUser={recognizedUser}
                    totalStudents={students.length}
                  />
                )
              )}

              {/* Navigation Actions */}
              <div className="flex flex-col gap-3 w-full">
                <Button
                  variant="w-full bg-red-600 hover:bg-red-700 text-sm font-medium"
                  onClick={() => navigate("/")}
                >
                  Tutup
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Background />
    </div>
  );
}

export default ScanFace;
