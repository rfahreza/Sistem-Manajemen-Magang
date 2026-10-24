import Swal from "sweetalert2";

export const playSound = (type) => {
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

export const showSuccessAlert = async (data, studentName) => {
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

export const showErrorAlert = async (message) => {
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
