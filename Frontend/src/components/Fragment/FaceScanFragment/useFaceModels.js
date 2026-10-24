import { useState, useEffect, useRef } from "react";
import * as faceapi from "@vladmandic/face-api";

/**
 * Hook to download Face-API neural network models and fetch registered student descriptors.
 * Builds and maintains the FaceMatcher instance used for identification.
 */
export const useFaceModels = () => {
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [students, setStudents] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Memuat sistem AI...");

  const faceMatcherRef = useRef(null);

  useEffect(() => {
    let active = true;

    const initFaceSystem = async () => {
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

        const response = await fetch("http://localhost:3000/api/absen/face-descriptors");
        const resData = await response.json();

        if (resData.success && Array.isArray(resData.data) && resData.data.length > 0) {
          setStudents(resData.data);

          const labeledDescriptors = resData.data.map((s) => {
            return new faceapi.LabeledFaceDescriptors(
              s.mahasiswa_id.toString(),
              [new Float32Array(s.face_descriptor)]
            );
          });

          // Distance threshold: <= 0.52 indicates high confidence match
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
          setStatusMessage("Gagal memuat model face recognition.");
        }
      }
    };

    initFaceSystem();

    return () => {
      active = false;
    };
  }, []);

  return {
    isLoadingModels,
    isLoadingData,
    students,
    statusMessage,
    setStatusMessage,
    faceMatcherRef,
  };
};
