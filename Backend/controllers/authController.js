const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const qrcodeUtil = require("../utils/qrcode");
const { v4: uuidv4 } = require("uuid");

const authController = {
  // Register mahasiswa baru
  register: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const {
        email,
        password,
        nim,
        nama,
        institusi,
        jenis_kelamin,
        alamat,
        no_telepon,
        tanggal_mulai,
        tanggal_selesai,
        admin_id,
        face_descriptor,
      } = req.body;

      // Validasi input
      if (
        !email ||
        !password ||
        !nim ||
        !nama ||
        !institusi ||
        !jenis_kelamin ||
        !alamat ||
        !no_telepon ||
        !tanggal_mulai ||
        !tanggal_selesai ||
        !admin_id
      ) {
        return res.status(400).json({
          success: false,
          message: "Semua field harus diisi",
        });
      }

      // Validasi face_descriptor
      if (
        !face_descriptor ||
        !Array.isArray(face_descriptor) ||
        face_descriptor.length !== 128 ||
        !face_descriptor.every((num) => typeof num === "number" && !isNaN(num))
      ) {
        return res.status(400).json({
          success: false,
          message: "Data wajah (face descriptor) wajib diisi dan harus valid",
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert user
      const [userResult] = await connection.execute(
        "INSERT INTO users (email, password, role, photo_profile) VALUES (?, ?, ?, NULL)",
        [email, hashedPassword, "mahasiswa"]
      );

      const userId = userResult.insertId;

      // Calculate sisa_hari
      const start = new Date(tanggal_mulai);
      const end = new Date(tanggal_selesai);
      const sisaHari = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

      // Insert mahasiswa first to get mahasiswa_id
      const [mahasiswaResult] = await connection.execute(
        `INSERT INTO mahasiswa (
          user_id, admin_id, nim, nama, institusi,
          jenis_kelamin, alamat, no_telepon, tanggal_mulai, tanggal_selesai,
          status, sisa_hari, face_descriptor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aktif', ?, ?)`,
        [
          userId,
          admin_id,
          nim,
          nama,
          institusi,
          jenis_kelamin,
          alamat,
          no_telepon,
          tanggal_mulai,
          tanggal_selesai,
          sisaHari,
          JSON.stringify(face_descriptor),
        ]
      );

      const mahasiswaId = mahasiswaResult.insertId;

      // Generate QR Code with the new mahasiswa data
      const qrCodePath = await qrcodeUtil.generateMahasiswaQR({
        id: mahasiswaId,
        nim,
        nama,
      });

      // Update mahasiswa with QR code path
      await connection.execute(
        "UPDATE mahasiswa SET qr_code = ? WHERE id = ?",
        [qrCodePath, mahasiswaId]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Registrasi berhasil",
        data: {
          id: mahasiswaId,
          qr_code: qrCodePath,
        },
      });
    } catch (error) {
      await connection.rollback();
      console.error("Register error:", error);
      // Delete QR code if exists
      if (error.qrCodePath) {
        await qrcodeUtil.deleteQRCode(error.qrCodePath);
      }
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat registrasi",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    } finally {
      connection.release();
    }
  },

  // Login
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      // Get user by email
      const [users] = await db.execute(
        "SELECT * FROM users WHERE email = ?",

        [email]
      );

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Email atau password salah",
        });
      }

      const user = users[0];

      // Verify password
      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Email atau password salah",
        });
      }

      // Get additional user data
      let additionalData = {};
      if (user.role === "mahasiswa") {
        const [mahasiswa] = await db.execute(
          "SELECT id as mahasiswa_id, admin_id, nama, nim, institusi, status FROM mahasiswa WHERE user_id = ?",
          [user.id]
        );
        if (mahasiswa.length > 0) {
          additionalData = mahasiswa[0];
        }
      } else if (user.role === "admin") {
        const [admin] = await db.execute(
          "SELECT id as admin_id, nama, validation_code FROM admin WHERE user_id = ?",
          [user.id]
        );
        if (admin.length > 0) {
          additionalData = admin[0];
        }
      }

      // Generate JWT token
      const tokenData = {
        id: user.id,
        role: user.role,
        email: user.email,
        ...additionalData,
      };
      console.log("Token data:", tokenData);

      const token = jwt.sign(
        {
          id: user.id,
          role: user.role,
          email: user.email,
          ...(user.role === "mahasiswa"
            ? { mahasiswa_id: additionalData.id }
            : {}),
          ...(user.role === "admin" ? { admin_id: additionalData.id } : {}),
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          ...additionalData,
        },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat login",
      });
    }
  },

  // Update password
  updatePassword: async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Password lama dan baru harus diisi",
        });
      }

      // Get current user
      const [users] = await db.execute("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      // Verify old password
      const validPassword = await bcrypt.compare(
        oldPassword,
        users[0].password
      );
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Password lama tidak sesuai",
        });
      }

      // Validate new password
      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password baru minimal 6 karakter",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await db.execute("UPDATE users SET password = ? WHERE id = ?", [
        hashedPassword,
        userId,
      ]);

      res.json({
        success: true,
        message: "Password berhasil diupdate",
      });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update password",
      });
    }
  },

  // Check validation code
  checkValidationCode: async (req, res) => {
    try {
      const { validation_code } = req.body;

      const [admins] = await db.execute(
        "SELECT * FROM admin WHERE validation_code = ?",
        [validation_code]
      );

      if (admins.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Kode validasi tidak valid",
        });
      }

      res.json({
        success: true,
        message: "Kode validasi benar",
      });
    } catch (error) {
      console.error("Validation code check error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat verifikasi kode",
      });
    }
  },

  // Logout
  logout: (req, res) => {
    try {
      res.status(200).json({
        success: true,
        message: "Logout berhasil",
      });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({
        success: false,
        message: "Logout gagal",
      });
    }
  },

  // Update password
  updatePassword: async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Get current user
      const [users] = await db.execute("SELECT * FROM users WHERE id = ?", [
        userId,
      ]);

      if (users.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      // Verify old password
      const validPassword = await bcrypt.compare(
        oldPassword,
        users[0].password
      );
      if (!validPassword) {
        return res.status(401).json({
          success: false,
          message: "Password lama tidak sesuai",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await db.execute("UPDATE users SET password = ? WHERE id = ?", [
        hashedPassword,
        userId,
      ]);

      res.json({
        success: true,
        message: "Password berhasil diupdate",
      });
    } catch (error) {
      console.error("Update password error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update password",
      });
    }
  },
};

module.exports = authController;
