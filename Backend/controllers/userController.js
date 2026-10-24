const db = require("../config/database");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const responseUtil = require("../utils/response");

const userController = {
  registerFace: async (req, res) => {
    try {
      const userId = req.user.id;
      const { descriptor } = req.body;

      if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return res.status(400).json({
          success: false,
          message: "Data wajah (descriptor) tidak valid. Harus berupa 128 nilai angka."
        });
      }

      const [mhs] = await db.execute("SELECT id FROM mahasiswa WHERE user_id = ?", [userId]);
      if (mhs.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Data mahasiswa tidak ditemukan"
        });
      }

      await db.execute(
        "UPDATE mahasiswa SET face_descriptor = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(descriptor), mhs[0].id]
      );

      return res.json({
        success: true,
        message: "Wajah berhasil didaftarkan"
      });
    } catch (error) {
      console.error("Register face error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mendaftarkan wajah"
      });
    }
  },

  deleteFace: async (req, res) => {
    try {
      const userId = req.user.id;
      await db.execute(
        "UPDATE mahasiswa SET face_descriptor = NULL, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
        [userId]
      );
      return res.json({
        success: true,
        message: "Data wajah berhasil dihapus"
      });
    } catch (error) {
      console.error("Delete face error:", error);
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat menghapus data wajah"
      });
    }
  },

  // Update getProfile method
  getProfile: async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      let query;
      if (userRole === "mahasiswa") {
        query = `SELECT u.email, u.photo_profile, u.role, 
                m.id, m.nim, m.nama, m.institusi, m.jenis_kelamin, 
                m.alamat, m.no_telepon, m.tanggal_mulai, m.tanggal_selesai,
                m.status, m.sisa_hari, (m.face_descriptor IS NOT NULL) AS is_face_registered
         FROM users u
         LEFT JOIN mahasiswa m ON u.id = m.user_id
         WHERE u.id = ?`;
      } else if (userRole === "admin") {
        query = `SELECT u.email, u.photo_profile, u.role,
                a.id, a.nama, a.validation_code, a.paraf_image
         FROM users u
         LEFT JOIN admin a ON u.id = a.user_id
         WHERE u.id = ?`;
      }

      const [user] = await db.execute(query, [userId]);

      if (user.length === 0) {
        return res.status(404).json({
          success: false,
          message: "User tidak ditemukan",
        });
      }

      // Add full URL for photo_profile
      if (user[0].photo_profile) {
        user[0].photo_profile = `${req.protocol}://${req.get(
          "host"
        )}/uploads/profiles/${user[0].photo_profile}`;
      }

      // For mahasiswa, include additional statistics
      if (userRole === "mahasiswa") {
        const [statistik] = await db.execute(
          `SELECT
           COUNT(*) as total_kehadiran,
           COUNT(CASE WHEN status_masuk = 'tepat_waktu' THEN 1 END) as tepat_waktu,
           COUNT(CASE WHEN status_masuk = 'telat' THEN 1 END) as telat,
           COUNT(CASE WHEN status_kehadiran = 'izin' THEN 1 END) as izin
           FROM absensi
           WHERE mahasiswa_id = ?`,
          [user[0].id]
        );

        const [logbook] = await db.execute(
          `SELECT
           COUNT(*) as total_entries,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
           FROM logbook
           WHERE mahasiswa_id = ?`,
          [user[0].id]
        );

        return res.json({
          success: true,
          data: {
            profile: user[0],
            statistik: statistik[0],
            logbook: logbook[0],
          },
        });
      }

      // For admin, return just the profile
      return res.json({
        success: true,
        data: {
          profile: user[0],
        },
      });
    } catch (error) {
      console.error("Get profile error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil data profile",
      });
    }
  },

  // Update updateProfile method
  updateProfile: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const userId = req.user.id;
      const mahasiswaId = req.user.mahasiswa_id;

      if (!mahasiswaId) {
        await connection.rollback();
        return res.status(403).json({
          success: false,
          message: "Akses ditolak. Data mahasiswa tidak ditemukan.",
        });
      }

      const { email, no_telepon, alamat } = req.body;
      const photoProfile = req.file ? req.file.filename : null;

      // If updating email, check if it's already taken
      if (email) {
        const [existingUser] = await connection.execute(
          "SELECT id FROM users WHERE email = ? AND id != ?",
          [email, userId]
        );

        if (existingUser.length > 0) {
          await connection.rollback();
          return res.status(400).json({
            success: false,
            message: "Email sudah digunakan",
          });
        }
      }

      // Update user data
      if (email || photoProfile) {
        const updateFields = [];
        const updateValues = [];

        if (email) {
          updateFields.push("email = ?");
          updateValues.push(email);
        }

        if (photoProfile) {
          // Delete old photo if exists
          const [oldPhoto] = await connection.execute(
            "SELECT photo_profile FROM users WHERE id = ?",
            [userId]
          );

          if (oldPhoto[0]?.photo_profile) {
            const oldPhotoPath = path.join(
              __dirname,
              "../uploads/profiles",
              oldPhoto[0].photo_profile
            );
            if (fs.existsSync(oldPhotoPath)) {
              fs.unlinkSync(oldPhotoPath);
            }
          }

          updateFields.push("photo_profile = ?");
          updateValues.push(photoProfile);
        }

        if (updateFields.length > 0) {
          await connection.execute(
            `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`,
            [...updateValues, userId]
          );
        }
      }

      // Update mahasiswa data
      if (no_telepon || alamat) {
        const updateFields = [];
        const updateValues = [];

        if (no_telepon) {
          updateFields.push("no_telepon = ?");
          updateValues.push(no_telepon);
        }

        if (alamat) {
          updateFields.push("alamat = ?");
          updateValues.push(alamat);
        }

        if (updateFields.length > 0) {
          await connection.execute(
            `UPDATE mahasiswa SET ${updateFields.join(", ")} WHERE id = ?`,
            [...updateValues, mahasiswaId]
          );
        }
      }

      await connection.commit();

      // Fetch updated profile data
      const [updatedUser] = await db.execute(
        `SELECT u.email, u.photo_profile, u.role, m.*
         FROM users u
         LEFT JOIN mahasiswa m ON u.id = m.user_id
         WHERE u.id = ?`,
        [userId]
      );

      // Add full URL for photo_profile
      if (updatedUser[0].photo_profile) {
        updatedUser[0].photo_profile = `${req.protocol}://${req.get(
          "host"
        )}/uploads/profiles/${updatedUser[0].photo_profile}`;
      }

      res.json({
        success: true,
        message: "Profile berhasil diupdate",
        data: updatedUser[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update profile error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update profile",
      });
    } finally {
      connection.release();
    }
  },

  // Get recent activities
  getRecentActivities: async (req, res) => {
    try {
      const userId = req.user.id;

      const [activities] = await db.execute(
        `SELECT activity, created_at
           FROM activities
           WHERE user_id = ?
           ORDER BY created_at DESC
           LIMIT 10`,
        [userId]
      );

      res.json({
        success: true,
        data: activities,
      });
    } catch (error) {
      console.error("Get recent activities error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil aktivitas terbaru",
      });
    }
  },

  getMahasiswaProfile: async (req, res) => {
    try {
      const userId = req.user.id;

      // Get mahasiswa data including QR code
      const [mahasiswa] = await db.execute(
        `SELECT m.nim, m.nama, m.qr_code
         FROM mahasiswa m
         JOIN users u ON m.user_id = u.id
         WHERE u.id = ?`,
        [userId]
      );

      if (mahasiswa.length === 0) {
        return responseUtil.notFound(res, "Mahasiswa tidak ditemukan");
      }

      // Construct full QR code URL if exists
      const qrCodeData = mahasiswa[0].qr_code
        ? {
            ...mahasiswa[0],
            qr_code: `${req.protocol}://${req.get("host")}/uploads/${
              mahasiswa[0].qr_code
            }`,
          }
        : mahasiswa[0];

      return responseUtil.success(res, qrCodeData);
    } catch (error) {
      console.error("Get mahasiswa profile error:", error);
      return responseUtil.error(
        res,
        "Terjadi kesalahan saat mengambil data mahasiswa"
      );
    }
  },

  getQRCode: async (req, res) => {
    try {
      const userId = req.user.id;

      const [mahasiswa] = await db.execute(
        `SELECT m.id, m.nim, m.nama, m.qr_code 
         FROM mahasiswa m 
         WHERE m.user_id = ?`,
        [userId]
      );

      if (!mahasiswa.length || !mahasiswa[0].qr_code) {
        return responseUtil.notFound(res, "QR Code tidak ditemukan");
      }

      const qrCodeUrl = `${req.protocol}://${req.get("host")}/uploads/${
        mahasiswa[0].qr_code
      }`;

      return responseUtil.success(res, { qr_code: qrCodeUrl });
    } catch (error) {
      console.error("Get QR Code error:", error);
      return responseUtil.error(
        res,
        "Terjadi kesalahan saat mengambil QR Code"
      );
    }
  },

  // Get status magang
  getStatusMagang: async (req, res) => {
    try {
      const userId = req.user.id;

      const [status] = await db.execute(
        `SELECT status
           FROM mahasiswa
           WHERE user_id = ?`,
        [userId]
      );

      if (status.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Status magang tidak ditemukan",
        });
      }

      res.json({
        success: true,
        data: status[0].status,
      });
    } catch (error) {
      console.error("Get status magang error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil status magang",
      });
    }
  },

  // Update password
  updatePassword: async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user.id;

      if (!req.user.mahasiswa_id) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak. Hanya mahasiswa yang diizinkan.",
        });
      }

      console.log("updatePassword - User:", req.user);

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

  // Get dashboard summary
  getDashboardSummary: async (req, res) => {
    try {
      const userId = req.user.id;

      const [mahasiswa] = await db.execute(
        "SELECT id, nama, sisa_hari FROM mahasiswa WHERE user_id = ?",
        [userId]
      );

      if (mahasiswa.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Data mahasiswa tidak ditemukan",
        });
      }

      res.json({
        success: true,
        data: mahasiswa[0],
      });
    } catch (error) {
      console.error("Get dashboard summary error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil data dashboard",
      });
    }
  },
};

module.exports = userController;
