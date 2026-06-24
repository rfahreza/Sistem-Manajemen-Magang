import React, { useState, useEffect } from "react";
import QrScanner from "react-qr-scanner";
import { useNavigate } from "react-router-dom";
import { CircularProgress } from "@mui/material";
import Swal from "sweetalert2";
import Background from "../Elements/Items/bg";
import Logo from "../Elements/Logo/Logo";

function ScanQr() {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const playSound = (type) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } else if (type === 'error') {
      oscillator.frequency.setValueAtTime(220, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.2);
    }

    setTimeout(() => {
      gainNode.disconnect();
      oscillator.disconnect();
    }, 1000);
  };

  const handleScan = async (data) => {
    if (data && !isLoading && data.text) {
      setIsLoading(true);

      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0,
          });
        });

        const requestData = {
          qrData: data.text,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          deviceInfo: JSON.stringify({
            userAgent: navigator.userAgent,
            platform: navigator.platform,
          }),
        };

        const response = await fetch("http://localhost:3000/api/absen/scan", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": `Bearer ${localStorage.getItem("token")}`
          },
          body: JSON.stringify(requestData),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || "Gagal memproses absensi");
        }

        if (result.success) {
          playSound('success');
          await showSuccessAlert(result.data);
          setTimeout(() => {
            window.location.reload();
          }, 3000); // Reload after 3 seconds
        }
      } catch (error) {
        playSound('error');
        await showErrorAlert(error.message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const showSuccessAlert = async (data) => {
    const timeString = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
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
              ${new Date().toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>

          <div class="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Nama</span>
                <span class="font-semibold text-gray-900">${data.nama}</span>
              </div>
              
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Waktu</span>
                <span class="font-semibold text-gray-900">${timeString} WIB</span>
              </div>

              ${data.type === "masuk" ? `
                <div class="flex items-center justify-between py-2">
                  <span class="text-gray-600">Status</span>
                  <span class="px-3 py-1 rounded-full text-sm font-medium ${
                    data.status === "tepat_waktu"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  }">
                    ${data.status === "tepat_waktu" ? "Tepat Waktu" : "Terlambat"}
                  </span>
                </div>
              ` : ''}

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
        popup: 'rounded-lg'
      }
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
              ${new Date().toLocaleDateString('id-ID', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
  
          <div class="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div class="p-4 space-y-4">
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-600">Waktu</span>
                <span class="font-semibold text-gray-900">
                  ${new Date().toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  })} WIB
                </span>
              </div>
  
              <div class="flex items-center justify-between py-2">
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
        popup: 'rounded-lg'
      }
    });
  };

  const handleError = async (err) => {
    console.error("Camera error:", err);
    playSound('error');
    await showErrorAlert("Gagal mengakses kamera. Pastikan kamera dalam keadaan aktif.");
  };

  return (
    <div className="h-screen bg-white relative overflow-hidden">
      <Logo />
      <div className="bg-white relative overflow-hidden flex flex-col items-center justify-center">
        <div className="relative z-10 flex flex-col items-center justify-center px-10">
          <div className="max-w-2xl w-full mx-auto justify-center bg-white mb-4 rounded-lg shadow-xl p-8 px-24 pb-10 flex flex-col items-center">
            <div className="max-w-md w-full">
              <h2 className="text-2xl font-semibold text-center mb-8">
                Scan QR Code Absensi
              </h2>

              {!isLoading && (
                <div className="relative mb-8 flex items-center justify-center">
                  <div className="relative h-80 w-80">
                    <div className="absolute inset-5">
                      <QrScanner
                        delay={300}
                        style={{
                          height: 280,
                          width: 280,
                          objectFit: "cover",
                        }}
                        onError={handleError}
                        onScan={handleScan}
                        className="rounded-lg"
                      />
                    </div>
                    <QRCorners />
                  </div>
                </div>
              )}

              {isLoading && (
                <div className="flex items-center justify-center mb-8">
                  <CircularProgress />
                </div>
              )}

              <div className="text-center space-y-4">
                {!isLoading && (
                  <button
                    className="px-6 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    onClick={() => navigate("/")}
                  >
                    Tutup
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Background />
    </div>
  );
}

const QRCorners = () => (
  <div className="absolute inset-0">
    <div className="absolute top-0 left-0 w-10 h-10">
      <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
      <div className="absolute top-0 left-0 w-2 h-full bg-red-500"></div>
    </div>
    <div className="absolute top-0 right-0 w-10 h-10">
      <div className="absolute top-0 right-0 w-full h-2 bg-red-500"></div>
      <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
    </div>
    <div className="absolute bottom-0 left-0 w-10 h-10">
      <div className="absolute bottom-0 left-0 w-full h-2 bg-red-500"></div>
      <div className="absolute bottom-0 left-0 w-2 h-full bg-red-500"></div>
    </div>
    <div className="absolute bottom-0 right-0 w-10 h-10">
      <div className="absolute bottom-0 right-0 w-full h-2 bg-red-500"></div>
      <div className="absolute bottom-0 right-0 w-2 h-full bg-red-500"></div>
    </div>
  </div>
);

export default ScanQr;