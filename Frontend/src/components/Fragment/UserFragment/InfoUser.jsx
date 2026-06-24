import React, { useState, useEffect } from "react";
import axios from "axios";

function InfoUser() {
  const [userData, setUserData] = useState({
    nama: "",
    institusi: "",
    sisa_hari: 0,
    tanggal_selesai: null
  });

  // Function to calculate business days between two dates
  const calculateBusinessDays = (endDate) => {
    const today = new Date();
    const end = new Date(endDate);
    
    // Return 0 if end date is in the past
    if (end < today) return 0;
    
    let count = 0;
    const current = new Date(today);
    
    // Set time to midnight to compare dates only
    current.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    while (current <= end) {
      // Sunday = 0, Saturday = 6
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
      // Move to next day
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  };

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem("token");
        const response = await axios.get("http://localhost:3000/api/user/profile", {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (response.data.success) {
          const { data } = response.data;
          const remainingDays = calculateBusinessDays(data.profile.tanggal_selesai);
          
          setUserData({
            nama: data.profile.nama,
            institusi: data.profile.institusi,
            sisa_hari: remainingDays,
            tanggal_selesai: data.profile.tanggal_selesai
          });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, []);

  return (
    <div className="bg-white rounded-xl shadow p-4 md:p-8 mb-6">
      <div className="flex flex-col md:flex-row justify-between items-center">
        <div className="mb-4 md:mb-0">
          <h1 className="text-2xl font-bold mb-2">
            Selamat Datang, {userData.nama}
          </h1>
          <p className="text-gray-600">Magang - {userData.institusi}</p>
        </div>
        <div className="text-right">
          <div className="text-gray-600">Masa Magang</div>
          <div className="text-red-500 text-xl font-medium">
            {userData.sisa_hari} Hari Kerja Tersisa
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoUser;