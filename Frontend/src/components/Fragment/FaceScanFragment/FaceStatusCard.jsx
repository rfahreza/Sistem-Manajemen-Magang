import React from "react";
import { Users } from "lucide-react";

const FaceStatusCard = ({ recognizedUser, totalStudents }) => {
  return (
    <div className="w-full mb-6">
      {recognizedUser ? (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl flex items-center justify-between transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {recognizedUser.name.charAt(0)}
            </div>
            <div>
              <h4 className="text-sm font-bold text-gray-800 leading-tight">
                {recognizedUser.name}
              </h4>
              <p className="text-xs text-gray-500">NIM: {recognizedUser.nim || "-"}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
            {recognizedUser.confidence}% Cocok
          </span>
        </div>
      ) : (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-400" />
            <span>Mahasiswa Terdaftar: <b className="text-gray-700">{totalStudents}</b></span>
          </div>
          <span className="italic">Posisikan wajah tepat di kamera</span>
        </div>
      )}
    </div>
  );
};

export default FaceStatusCard;
