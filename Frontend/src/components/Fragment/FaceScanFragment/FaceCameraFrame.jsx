import React from "react";
import { CircularProgress } from "@mui/material";
import { CheckCircle2 } from "lucide-react";

export const FaceCorners = () => (
  <div className="absolute inset-0 pointer-events-none">
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

const FaceCameraFrame = ({
  videoRef,
  canvasRef,
  isLoading,
  statusMessage,
  cooldown,
  isProcessing,
}) => {
  return (
    <div className="relative mb-6 flex items-center justify-center">
      <div className="relative w-80 h-80">
        <div className="absolute inset-5 rounded-2xl overflow-hidden bg-gray-950 shadow-inner border-2 border-gray-200 flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-white space-y-3">
            <CircularProgress size={40} style={{ color: "#2563EB" }} />
            <span className="text-xs font-medium text-gray-300">{statusMessage}</span>
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

            {/* Overlay Status Pill */}
            {cooldown ? (
              <div className="absolute bottom-3 bg-black/80 px-3.5 py-1.5 rounded-full text-green-500 font-medium text-xs flex items-center gap-1.5 backdrop-blur-sm border border-green-500/30">
                Absensi tercatat
              </div>
            ) : isProcessing ? (
              <div className="absolute bottom-3 bg-black/80 px-3.5 py-1.5 rounded-full text-blue-400 font-medium text-xs flex items-center gap-2 backdrop-blur-sm border border-blue-500/30">
                <CircularProgress size={13} color="inherit" /> Memproses absensi...
              </div>
            ) : (
              <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 text-white text-xs rounded-full backdrop-blur-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live
              </div>
            )}
          </>
        )}
        </div>

        <FaceCorners />
      </div>
    </div>
  );
};

export default FaceCameraFrame;
