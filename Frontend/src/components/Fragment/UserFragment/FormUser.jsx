import React, { useState, useEffect } from "react";
import { Camera, Eye, EyeOff, Lock, Check, X } from "lucide-react";
import { useAuth } from "../../Context/UserContext";

const FormUser = () => {
  const { user, updateProfile, updatePassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [showPassword, setShowPassword] = useState({
    old: false,
    new: false,
    confirm: false
  });

  const [profileData, setProfileData] = useState({
    nama: "",
    nim: "",
    email: "",
    no_telepon: "",
    institusi: "",
    alamat: "",
    photo: null,
    photoPreview: null,
  });

  const [passwordData, setPasswordData] = useState({
    oldPassword: "",
    newPassword: "",
    konfirmasiPassword: "",
  });

  const [validationChecks, setValidationChecks] = useState({
    length: false,
    uppercase: false,
    number: false,
    match: false
  });

  useEffect(() => {
    if (user) {
      setProfileData({
        nama: user.nama || "",
        nim: user.nim || "",
        email: user.email || "",
        no_telepon: user.no_telepon || "",
        institusi: user.institusi || "",
        alamat: user.alamat || "",
        photo: null,
        photoPreview: user.photo_profile || null,
      });
    }
  }, [user]);

  useEffect(() => {
    const newPassword = passwordData.newPassword;
    const konfirmasi = passwordData.konfirmasiPassword;
    
    setValidationChecks({
      length: newPassword.length >= 8,
      uppercase: /[A-Z]/.test(newPassword),
      number: /[0-9]/.test(newPassword),
      match: newPassword === konfirmasi && newPassword !== ""
    });
  }, [passwordData.newPassword, passwordData.konfirmasiPassword]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('id-ID', { 
      day: 'numeric',
      month: 'long', 
      year: 'numeric'
    });
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setMessage({
          type: "error",
          text: "File terlalu besar. Maksimal 2MB"
        });
        return;
      }
      
      if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
        setMessage({ type: "error", text: "Tipe file tidak diizinkan. Gunakan JPG, JPEG, atau PNG" });
        return;
      }

      setProfileData(prev => ({
        ...prev,
        photo: file,
        photoPreview: URL.createObjectURL(file),
      }));
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const formData = new FormData();
      if (profileData.nama !== user.nama) formData.append("nama", profileData.nama);
      if (profileData.email !== user.email) formData.append("email", profileData.email);
      if (profileData.no_telepon !== user.no_telepon) formData.append("no_telepon", profileData.no_telepon);
      if (profileData.alamat !== user.alamat) formData.append("alamat", profileData.alamat);
      if (profileData.photo) formData.append("photo_profile", profileData.photo);

      const response = await updateProfile(formData);
      if (response.success) {
        setMessage({ type: "success", text: response.message });
      } else {
        throw new Error(response.message || "Update profile gagal");
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Terjadi kesalahan saat update profile"
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const response = await updatePassword({
        oldPassword: passwordData.oldPassword,
        newPassword: passwordData.newPassword,
      });

      if (response.success) {
        setMessage({ type: "success", text: "Password berhasil diperbarui" });
        setPasswordData({
          oldPassword: "",
          newPassword: "",
          konfirmasiPassword: "",
        });
      }
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Terjadi kesalahan saat update password"
      });
    } finally {
      setLoading(false);
    }
  };

  const ValidationItem = ({ fulfilled, text }) => (
    <div className="flex items-center gap-2">
      {fulfilled ? (
        <Check size={16} className="text-green-500" />
      ) : (
        <X size={16} className="text-gray-300" />
      )}
      <span className={`text-sm ${fulfilled ? 'text-green-500' : 'text-gray-500'}`}>
        {text}
      </span>
    </div>
  );

  return (
    <div className="bg-gray- max-w-full overflow-x-hidden">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Side - Main Content */}
        <div className="col-span-1 md:col-span-3 space-y-6">
          {/* Profile Section */}
          <div className="bg-white rounded-xl shadow-sm drop-shadow-mg">
            <div className="flex flex-col md:flex-row p-4 md:p-6 gap-6 md:gap-8">
              {/* Photo Upload */}
              <div className="flex-none">
                <div className="relative w-32 mx-auto md:mx-0">
                  <div className="w-32 h-32 rounded-xl overflow-hidden bg-gray-50 border-2 border-gray-200">
                    {profileData.photoPreview ? (
                      <img
                        src={profileData.photoPreview}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        No Photo
                      </div>
                    )}
                  </div>
                  <label className="absolute bottom-2 right-2 p-2 bg-white rounded-lg shadow-lg cursor-pointer hover:bg-gray-50 border border-gray-200">
                    <Camera size={18} className="text-gray-500" />
                    <input
                      type="file"
                      className="hidden"
                      accept="image/jpeg,image/png,image/jpg"
                      onChange={handlePhotoChange}
                    />
                  </label>
                </div>
                <p className="mt-2 text-xs text-center text-gray-500">
                  Format: JPG, JPEG, PNG<br />Maks. 2MB
                </p>
              </div>

              {/* Profile Form */}
              <div className="flex-1">
                <form onSubmit={handleProfileUpdate} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nama Lengkap
                      </label>
                      <input
                        type="text"
                        value={profileData.nama}
                        readOnly
                        className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        NIM
                      </label>
                      <input
                        type="text"
                        value={profileData.nim}
                        readOnly
                        className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nomor Telepon
                      </label>
                      <input
                        type="tel"
                        value={profileData.no_telepon}
                        onChange={(e) => setProfileData({ ...profileData, no_telepon: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Institusi
                      </label>
                      <input
                        type="text"
                        value={profileData.institusi}
                        readOnly
                        className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Alamat
                      </label>
                      <input
                        type="text"
                        value={profileData.alamat}
                        onChange={(e) => setProfileData({ ...profileData, alamat: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full md:w-auto px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Password Section */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 md:p-6">
              <div className="flex items-center gap-2 mb-6">
                <Lock className="w-5 h-5 text-gray-500" />
                <h2 className="text-lg font-medium">Ubah Password</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Password Fields */}
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password Lama
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword.old ? "text" : "password"}
                        value={passwordData.oldPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, old: !showPassword.old })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword.old ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password Baru
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword.new ? "text" : "password"}
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, new: !showPassword.new })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword.new ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Konfirmasi Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword.confirm ? "text" : "password"}
                        value={passwordData.konfirmasiPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, konfirmasiPassword: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword({ ...showPassword, confirm: !showPassword.confirm })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || !Object.values(validationChecks).every(Boolean)}
                      className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                      {loading ? 'Memperbarui...' : 'Update Password'}
                    </button>
                  </div>
                </form>

                {/* Password Requirements */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    Persyaratan Password
                  </h3>
                  <div className="space-y-2">
                    <ValidationItem 
                      fulfilled={validationChecks.length} 
                      text="Minimal 8 karakter" 
                    />
                    <ValidationItem 
                      fulfilled={validationChecks.uppercase} 
                      text="Minimal satu huruf besar (A-Z)" 
                    />
                    <ValidationItem 
                      fulfilled={validationChecks.number} 
                      text="Minimal satu angka (0-9)" 
                    />
                    <ValidationItem 
                      fulfilled={validationChecks.match} 
                      text="Password baru dan konfirmasi sama" 
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Status */}
        <div className="col-span-1">
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 md:p-6">
              <h2 className="text-lg font-medium mb-4">Status Magang</h2>
              
              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-500">Status</span>
                  <p className="text-green-600 font-medium mt-1">
                    {user?.status || "Aktif"}
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-500">Periode Magang</span>
                  <p className="font-medium mt-1">
                    {user?.tanggal_mulai && user?.tanggal_selesai 
                      ? `${formatDate(user.tanggal_mulai)} - ${formatDate(user.tanggal_selesai)}`
                      : "-"
                    }
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-500">Sisa Waktu</span>
                  <p className="font-medium mt-1">
                    {user?.sisa_hari || "0"} Hari
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert Messages */}
      {message.text && (
        <div
          className={`fixed bottom-4 right-4 max-w-full md:max-w-sm p-4 rounded-lg shadow-lg ${
            message.type === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};

export default FormUser;