import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./components/Context/UserContext";
import ProtectedRoute from "./components/ProtectedRoute";

// Import pages
import LoginPage from "./Pages/Auth/login";
import RegisterPage from "./Pages/Auth/register";
import ScanQRCodePage from "./Pages/Auth/scan";
import ScanFacePage from "./Pages/Auth/scanFace";
import DashboardPage from "./Pages/Admin/dashboard";
import InternshipPage from "./Pages/Admin/internship";
import AbsensiPage from "./Pages/Admin/absensi";
import LogbookPage from "./Pages/Admin/logbook";
import LaporanPage from "./Pages/Admin/laporan";
import DashboardUserPage from "./Pages/Users/dashboardUser";
import AbsensiUserPage from "./Pages/Users/absensiUser";
import LogbookUserPage from "./Pages/Users/logbookUser";
import LaporanUserPage from "./Pages/Users/laporanUser";
import ProfilePage from "./Pages/Admin/profile";
import ProfilePageUser from "./Pages/Users/profileUser";

import "./index.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/Sistem-Manajemen-Magang">
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/scan" element={<ScanQRCodePage />} />
          <Route path="/scan-face" element={<ScanFacePage />} />

          {/* Protected Admin Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/internship"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <InternshipPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/absensi"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AbsensiPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logbook"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <LogbookPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/laporan"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <LaporanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* Protected Mahasiswa Routes */}
          <Route
            path="/dashboardUser"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <DashboardUserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/absensiUser"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <AbsensiUserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logbookUser"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <LogbookUserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/laporanUser"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <LaporanUserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profileUser"
            element={
              <ProtectedRoute allowedRoles={["mahasiswa"]}>
                <ProfilePageUser />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);