# Rencana Implementasi: Integrasi Pendaftaran Wajah (Face Enrollment) pada Registrasi & Profil

Rencana ini membagi pekerjaan menjadi tugas-tugas terisolasi yang dapat dijalankan secara berurutan.

---

## Todo List

- [ ] **Task 1: Validasi & Penyimpanan Face Descriptor pada Registrasi (Backend)**
  - **Deskripsi**: Perbarui controller registrasi untuk menerima, memvalidasi, dan menyimpan data `face_descriptor`.
  - **File**: `Backend/controllers/authController.js`
  - **Detail**:
    - Tambahkan pengecekan input: `face_descriptor` wajib ada, berupa array, panjang tepat 128 elemen, dan berisi tipe data number.
    - Perbarui query SQL `INSERT INTO mahasiswa` untuk menyertakan `face_descriptor` dengan nilai `JSON.stringify(face_descriptor)`.

- [ ] **Task 2: Endpoint Hapus Wajah (Backend)**
  - **Deskripsi**: Buat endpoint `DELETE /api/user/delete-face` untuk menghapus data wajah.
  - **File**: 
    - `Backend/controllers/userController.js` (tambahkan handler `deleteFace`)
    - `Backend/routes/userRoutes.js` (hubungkan route dengan auth middleware)
  - **Detail**:
    - Gunakan `req.user.mahasiswa_id` untuk memperbarui field `face_descriptor` menjadi `NULL` pada tabel `mahasiswa`.
    - Kembalikan response json sukses/gagal yang sesuai.

- [ ] **Task 3: Form Registrasi Multi-Step dengan Scan Wajah (Frontend)**
  - **Deskripsi**: Ubah form registrasi menjadi multi-step di mana Step 2 mewajibkan scan wajah sebelum submit akun.
  - **File**: `Frontend/src/components/Fragment/FormRegister.jsx`
  - **Detail**:
    - Tambahkan state `step` ('biodata' | 'face_scan') dan `faceDescriptor`.
    - Pada Step 1, ubah tombol "Daftar" menjadi "Lanjut ke Verifikasi Wajah" yang memvalidasi form input.
    - Pada Step 2, tampilkan modul kamera terintegrasi yang memuat model dari `@vladmandic/face-api`, mendeteksi wajah, dan mengumpulkan 5 sampel.
    - Setelah sampel terkumpul, hitung nilai rata-rata, simpan ke state `faceDescriptor`, dan aktifkan tombol "Daftar & Buat Akun" untuk mengirim data lengkap (termasuk `face_descriptor`) ke backend.

- [ ] **Task 4: Kartu Pengaturan Wajah di Dashboard Profil (Frontend)**
  - **Deskripsi**: Tambahkan kartu "Keamanan Wajah (Face Recognition)" di halaman profil untuk mengelola data wajah.
  - **File**: `Frontend/src/components/Fragment/UserFragment/FormUser.jsx`
  - **Detail**:
    - Tambahkan Card di samping/di bawah kartu "Ubah Password".
    - Jika wajah belum terdaftar (`user.has_face_enrolled` adalah false): Tampilkan status "Belum Terdaftar" dan tombol "Daftarkan Wajah" (membuka modal `FaceEnrollment`).
    - Jika wajah sudah terdaftar: Tampilkan status "Terdaftar Aktif", tombol "Perbarui Wajah" (membuka modal `FaceEnrollment`), dan tombol "Hapus Wajah" (memicu SweetAlert2 konfirmasi dan menembak endpoint `DELETE /api/user/delete-face`).
    - Pastikan state profil ter-refresh setelah berhasil mendaftar atau menghapus wajah.
