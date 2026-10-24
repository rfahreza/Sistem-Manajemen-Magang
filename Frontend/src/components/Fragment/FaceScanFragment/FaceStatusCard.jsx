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
        </div>
      ) : (
        <div className=" flex items-center justify-between text-xs text-gray-500">
          <span className="italic">Posisikan wajah tepat di kamera</span>
        </div>
      )}
    </div>
  );
};

export default FaceStatusCard;
