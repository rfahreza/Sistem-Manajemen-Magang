import React, { useCallback } from "react";
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

  // Handle attendance submission to API
  const handleAttendance = useCallback(
    async (mahasiswaId, studentName) => {
      markProcessing(true);

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
          mahasiswa_id: mahasiswaId,
          latitude: position?.coords?.latitude || null,
          longitude: position?.coords?.longitude || null,
          deviceInfo: JSON.stringify({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            mode: "kiosk_face_recognition",
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
        await showSuccessAlert(result.data, studentName);
      } catch (error) {
        playSound("error");
        await showErrorAlert(error.message || "Gagal memproses absensi wajah");
      } finally {
        startCooldown(3500);
      }
    },
    [] // stable reference
  );

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
    markProcessing,
  } = useFaceScanner({ onMatch: handleAttendance });

  const isLoading = isLoadingModels || isLoadingData;

  return (
    <div className="h-screen bg-white relative overflow-hidden">
      <Logo />

      <div className="bg-white relative overflow-hidden flex flex-col items-center justify-center">
        <div className="relative z-10 flex flex-col items-center justify-center px-10">
          <div className="max-w-2xl w-full mx-auto justify-center bg-white mb-4 rounded-lg shadow-xl p-8 px-24 pb-10 flex flex-col items-center">
            <div className="max-w-md w-full">
              <h2 className="text-2xl font-semibold text-center mb-8">
                Scan Wajah Absensi
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

              {/* Recognition Status / Standby Banner */}
              {!isLoading && (
                <FaceStatusCard
                  recognizedUser={recognizedUser}
                  totalStudents={students.length}
                />
              )}

              {/* Action Buttons using existing repository elements */}
              <div className="flex flex-col gap-3 w-full">
                <WhiteButton
                  variant="w-full text-sm"
                  onClick={() => navigate("/scan")}
                >
                  Scan QR Code
                </WhiteButton>

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
