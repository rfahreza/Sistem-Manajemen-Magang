import React, { useState, useEffect } from "react";
import NavbarUser from "../../components/Fragment/UserFragment/NavbarUser";
import ProfileUser from "../../components/Layouts/UsersLayouts/ProfileUser";
import FaceEnrollment from "../../components/Fragment/UserFragment/FaceEnrollment";
import axios from "axios";

function ProfileUserPage() {
  const [profile, setProfile] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [statusMagang, setStatusMagang] = useState(null);
  const [periodeMagang, setPeriodeMagang] = useState("");
  const [showEnrollment, setShowEnrollment] = useState(false);

  useEffect(() => {
    fetchProfile();
    fetchRecentActivities();
    fetchStatusMagang();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get("/api/user/profile");
      const profileData = response.data.data;
      setProfile(profileData);
      setPeriodeMagang(profileData.period);
    } catch (error) {
      console.error("Error fetching profile:", error);
    }
  };

  const fetchRecentActivities = async () => {
    try {
      const response = await axios.get("/api/user/recent-activities");
      setRecentActivities(response.data.data);
    } catch (error) {
      console.error("Error fetching recent activities:", error);
    }
  };

  const fetchStatusMagang = async () => {
    try {
      const response = await axios.get("/api/user/status-magang");
      setStatusMagang(response.data.data);
    } catch (error) {
      console.error("Error fetching status magang:", error);
    }
  };

  const handleUpdateProfile = async (updatedProfile) => {
    try {
      await axios.put("/api/user/profile", updatedProfile);
      fetchProfile(); // Refresh profile data after update
    } catch (error) {
      console.error("Error updating profile:", error);
    }
  };

  const handleUpdatePassword = async (passwordData) => {
    try {
      await axios.put("/api/user/profile/password", passwordData);
      fetchProfile(); // Refresh profile data after password update
    } catch (error) {
      console.error("Error updating password:", error);
    }
  };

  return (
    <>
      {/* Face Enrollment Banner */}
      {profile && !profile.profile?.has_face_enrolled && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mx-4 mt-4 rounded">
          <div className="flex items-center justify-between">
            <p className="text-yellow-800 text-sm font-medium">
              ⚠️ Kamu belum mendaftarkan wajah. Daftarkan untuk bisa absen via face recognition.
            </p>
            <button
              onClick={() => setShowEnrollment(true)}
              className="ml-4 px-4 py-2 bg-yellow-400 text-yellow-900 rounded text-sm font-semibold hover:bg-yellow-500"
            >
              Daftarkan Wajah
            </button>
          </div>
        </div>
      )}

      {/* Enrolled badge */}
      {profile && profile.profile?.has_face_enrolled && (
        <div className="bg-green-50 border-l-4 border-green-400 p-4 mx-4 mt-4 rounded">
          <div className="flex items-center justify-between">
            <p className="text-green-800 text-sm font-medium">
              ✓ Wajah sudah terdaftar. Kamu bisa absen via face recognition.
            </p>
            <button
              onClick={() => setShowEnrollment(true)}
              className="ml-4 px-4 py-2 bg-green-100 text-green-800 rounded text-sm font-semibold hover:bg-green-200"
            >
              Perbarui Wajah
            </button>
          </div>
        </div>
      )}

      <NavbarUser profile={profile} />
      <ProfileUser
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        onUpdatePassword={handleUpdatePassword}
      />

      {/* Enrollment Modal */}
      {showEnrollment && (
        <FaceEnrollment
          onSuccess={() => {
            setShowEnrollment(false);
            fetchProfile(); // refresh to update has_face_enrolled
          }}
          onClose={() => setShowEnrollment(false)}
        />
      )}
    </>
  );
}

export default ProfileUserPage;
