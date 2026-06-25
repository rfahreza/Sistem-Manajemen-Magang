# Spesifikasi Desain: Integrasi Pendaftaran Wajah (Face Enrollment) pada Registrasi & Profil

Dokumen ini mendefinisikan rancangan teknis untuk menambahkan proses pendaftaran wajah (Face Enrollment) saat pendaftaran akun baru (Register) dan pengelolaan data wajah di pengaturan profil (Dashboard Profil).

---

## 1. Latar Belakang & Kebutuhan
Sebelumnya, sistem absensi telah memiliki fitur absensi pindai wajah (Face Recognition Attendance) dan endpoint pendaftaran wajah, namun belum memiliki alur terintegrasi bagi pengguna baru untuk mendaftarkan wajah mereka sejak awal registrasi. Pengguna juga membutuhkan kemampuan untuk memperbarui (edit) dan menghapus (delete) data wajah mereka secara langsung dari profil mereka.

**Kebutuhan Utama:**
1. **Pendaftaran Wajah Wajib saat Registrasi**: Calon mahasiswa magang harus memindai wajah mereka menggunakan kamera web pada saat melakukan registrasi sebelum dapat membuat akun.
2. **Pengelolaan Wajah di Profil**: Mahasiswa magang harus dapat menambahkan (jika belum ada), memperbarui (pindai ulang), dan menghapus data wajah terdaftar melalui halaman profil mereka di dashboard.

---

## 2. Arsitektur & Perubahan Backend

### 2.1. Validasi & Penyimpanan Data Wajah pada Registrasi
* **Endpoint**: `POST /api/auth/register`
* **Controller**: [authController.js](file:///H:/SIMAGANG/Sistem-Manajemen-Magang/Backend/controllers/authController.js)
* **Spesifikasi Payload Request**:
  ```json
  {
    "email": "...",
    "password": "...",
    "nim": "...",
    "nama": "...",
    "institusi": "...",
    "jenis_kelamin": "...",
    "alamat": "...",
    "no_telepon": "...",
    "tanggal_mulai": "2026-06-01",
    "tanggal_selesai": "2026-09-01",
    "admin_id": 1,
    "face_descriptor": [0.12, -0.05, ..., 0.08] // Array of 128 floats
  }
  ```
* **Logika Backend**:
  1. Tambahkan validasi wajib untuk `face_descriptor` di dalam input validation:
     - Harus ada (`required`).
     - Harus bertipe `Array`.
     - Harus memiliki panjang tepat `128` elemen.
     - Setiap elemen harus bertipe `number`.
  2. Masukkan data wajah ke dalam query `INSERT INTO mahasiswa`:
     - Data disimpan menggunakan `JSON.stringify(face_descriptor)` ke dalam kolom `face_descriptor` pada tabel `mahasiswa`.

### 2.2. Endpoint Hapus Data Wajah
* **Endpoint**: `DELETE /api/user/delete-face`
* **Controller**: [userController.js](file:///H:/SIMAGANG/Sistem-Manajemen-Magang/Backend/controllers/userController.js)
* **Proteksi**: Memerlukan JWT Token login dengan role `mahasiswa`.
* **Logika Backend**:
  1. Dapatkan `mahasiswa_id` dari token pengguna yang masuk (`req.user.mahasiswa_id`).
  2. Eksekusi query:
     ```sql
     UPDATE mahasiswa SET face_descriptor = NULL WHERE id = ?
     ```
  3. Mengembalikan respons sukses:
     ```json
     {
       "success": true,
       "message": "Data wajah berhasil dihapus"
     }
     ```

---

## 3. Desain Antarmuka (Frontend)

### 3.1. Halaman Register Multi-Step
* **Komponen Terkait**: [FormRegister.jsx](file:///H:/SIMAGANG/Sistem-Manajemen-Magang/Frontend/src/components/Fragment/FormRegister.jsx)
* **State Tambahan**:
  - `step`: `'biodata' | 'face_scan'` (default `'biodata'`)
  - `faceDescriptor`: `Array | null` (default `null`)
* **Alur Antarmuka**:
  1. **Step 1 (Biodata)**:
     - Tampilan form registrasi standar dengan kolom Nama, NIM, Email, dll.
     - Tombol submit diganti teksnya menjadi **"Lanjut ke Verifikasi Wajah"**.
     - Ketika diklik, periksa validasi form biodata (NIM, email, password, dll). Jika valid, ubah state `step` ke `'face_scan'`.
  2. **Step 2 (Pencatatan Wajah)**:
     - Sembunyikan form biodata secara visual.
     - Tampilkan container kamera. Saat step aktif, otomatis jalankan logika pemuatan model wajah dari `@vladmandic/face-api` dan nyalakan kamera.
     - Tambahkan panduan visual lingkaran deteksi wajah.
     - Pengguna menekan tombol **"Mulai Pindai Wajah"** untuk mengumpulkan 5 sampel wajah.
     - Tampilkan indikator progres (1/5 hingga 5/5) secara real-time.
     - Setelah sukses (5 sampel terkumpul), matikan kamera, rata-ratakan deskriptor wajah, simpan di state `faceDescriptor`, dan tampilkan badge sukses hijau beserta tombol **"Daftar & Buat Akun"**.
     - Tombol **"Kembali"** disediakan untuk membatalkan proses scan wajah, mematikan kamera secara bersih, dan mengembalikan `step` ke `'biodata'`.

### 3.2. Pengaturan Profil (FormUser)
* **Komponen Terkait**: [FormUser.jsx](file:///H:/SIMAGANG/Sistem-Manajemen-Magang/Frontend/src/components/Fragment/UserFragment/FormUser.jsx)
* **Logika Tampilan Baru**:
  - Tambahkan kartu **"Keamanan Wajah (Face Recognition)"** di samping kartu "Ubah Password".
  - Kartu ini memantau status `user.has_face_enrolled` yang diperoleh dari data user profile.
  - **Jika Belum Terdaftar (`user.has_face_enrolled === false`)**:
    - Tampilkan pesan peringatan: *"Wajah belum didaftarkan."*
    - Tombol **"Daftarkan Wajah"** untuk membuka modal `FaceEnrollment`.
  - **Jika Sudah Terdaftar (`user.has_face_enrolled === true`)**:
    - Tampilkan pesan: *"Wajah terdaftar secara aktif."*
    - Tombol **"Perbarui Wajah"**: membuka modal `FaceEnrollment` untuk merekam ulang (overwrite) wajah baru.
    - Tombol **"Hapus Wajah"**: memicu SweetAlert2 konfirmasi hapus wajah. Jika disetujui, panggil `DELETE /api/user/delete-face`, dan panggil ulang data profil terupdate.

---

## 4. Rencana Pengujian (Testing)
1. **Uji Validasi Backend**: Pastikan registrasi gagal jika `face_descriptor` dikirim kosong atau format array tidak pas 128 elemen.
2. **Uji Alur Register**: Pastikan pendaftaran hanya berhasil jika pengguna menyelesaikan seluruh step pendaftaran wajah. Cek di DB apakah data wajah tersimpan dalam format JSON array.
3. **Uji Tambah & Edit di Profil**: Pastikan penambahan wajah via profil mengubah status profil menjadi terdaftar. Cek fitur perbarui wajah sukses mengganti data lama.
4. **Uji Hapus Wajah**: Pastikan data wajah kembali menjadi `NULL` setelah tombol hapus diklik dan disetujui.
