const db = require("../config/database");
const geolib = require("geolib");
const qrcodeUtil = require("../utils/qrcode");
const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");

const absenController = {
  scanQR: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { qrData, latitude, longitude, deviceInfo } = req.body;
  
      // Validate QR code
      const validationResult = qrcodeUtil.validateQRContent(qrData);
      if (!validationResult.isValid) {
        // Tambahkan header untuk memainkan suara error
        res.setHeader('X-Play-Sound', 'error');
        return res.status(400).json({
          success: false,
          message: validationResult.message,
        });
      }
  
      const mahasiswa_id = validationResult.data.mahasiswa_id;
  
      // Get mahasiswa data
      const [mahasiswa] = await connection.execute(
        'SELECT * FROM mahasiswa WHERE id = ? AND status = "aktif"',
        [mahasiswa_id]
      );
  
      if (mahasiswa.length === 0) {
        // Tambahkan header untuk memainkan suara error
        res.setHeader('X-Play-Sound', 'error');
        return res.status(404).json({
          success: false,
          message: "Mahasiswa tidak ditemukan atau tidak aktif",
        });
      }
  
      // Get active setting
      const [settings] = await connection.execute(
        "SELECT * FROM setting_absensi WHERE is_active = true"
      );
  
      if (settings.length === 0) {
        // Tambahkan header untuk memainkan suara error
        res.setHeader('X-Play-Sound', 'error');
        return res.status(400).json({
          success: false,
          message: "Pengaturan absensi belum dikonfigurasi",
        });
      }
  
      const setting = settings[0];
  
      // Check if within radius
      const distance = geolib.getDistance(
        { latitude, longitude },
        {
          latitude: setting.latitude_pusat,
          longitude: setting.longitude_pusat,
        }
      );
  
      const dalamRadius = distance <= setting.radius_meter;
  
      // Get current time
      const now = new Date();
      const currentTime = now.toTimeString().split(" ")[0];
      const currentDate = now.toISOString().split("T")[0];
  
      // Check if already checked in today
      const [existingAbsensi] = await connection.execute(
        "SELECT * FROM absensi WHERE mahasiswa_id = ? AND DATE(tanggal) = ?",
        [mahasiswa_id, currentDate]
      );
  
      if (existingAbsensi.length === 0) {
        // Determine status for new check-in
        let statusMasuk = "tepat_waktu";
        if (currentTime > setting.jam_masuk) {
          const timeDiff =
            (new Date(`2000/01/01 ${currentTime}`) -
              new Date(`2000/01/01 ${setting.jam_masuk}`)) /
            1000 /
            60;
  
          if (timeDiff > setting.batas_telat_menit) {
            statusMasuk = "telat";
          }
        }
  
        // Create new attendance record for check-in
        await connection.execute(
          `INSERT INTO absensi (
            mahasiswa_id, setting_absensi_id, tanggal,
            waktu_masuk, status_masuk, status_kehadiran,
            latitude_scan, longitude_scan, dalam_radius,
            device_info
          ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'hadir', ?, ?, ?, ?)`,
          [
            mahasiswa_id,
            setting.id,
            currentDate,
            statusMasuk,
            latitude,
            longitude,
            dalamRadius,
            deviceInfo,
          ]
        );
  
        await connection.commit();
        
        // Tambahkan header untuk memainkan suara sukses
        res.setHeader('X-Play-Sound', 'success');
        return res.json({
          success: true,
          message: "Absen masuk berhasil",
          data: {
            type: "masuk",
            status: statusMasuk,
            dalam_radius: dalamRadius,
            nama: mahasiswa[0].nama,
            waktu: currentTime,
          },
        });
      } else {
        // Check if already checked out
        if (existingAbsensi[0].waktu_keluar !== null) {
          // Tambahkan header untuk memainkan suara error
          res.setHeader('X-Play-Sound', 'error');
          return res.status(400).json({
            success: false,
            message: "Anda sudah absen pulang",
          });
        }

        // Check if can check out
        if (currentTime < setting.jam_pulang) {
          // Tambahkan header untuk memainkan suara error
          res.setHeader('X-Play-Sound', 'error');
          return res.status(400).json({
            success: false,
            message: "Belum waktunya pulang",
          });
        }
  
        // Update only waktu_keluar for check-out
        await connection.execute(
          `UPDATE absensi 
           SET waktu_keluar = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP 
           WHERE id = ? 
           AND waktu_keluar IS NULL`,
          [existingAbsensi[0].id]
        );
  
        await connection.commit();
        
        // Tambahkan header untuk memainkan suara sukses
        res.setHeader('X-Play-Sound', 'success');
        return res.json({
          success: true,
          message: "Absen pulang berhasil",
          data: {
            type: "pulang",
            nama: mahasiswa[0].nama,
            waktu: currentTime,
            dalam_radius: dalamRadius
          },
        });
      }
    } catch (error) {
      await connection.rollback();
      console.error("Scan QR error:", error);
      // Tambahkan header untuk memainkan suara error
      res.setHeader('X-Play-Sound', 'error');
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat proses absensi",
      });
    } finally {
      connection.release();
    }
  },

  // Get riwayat absensi mahasiswa
  getRiwayatAbsensi: async (req, res) => {
    try {
      const adminId = req.user.admin_id;
      const { startDate, endDate, status, search, page = 1, limit = 10 } = req.query;
  
      let query = `
        SELECT 
          a.id,
          a.tanggal,
          a.waktu_masuk,
          a.waktu_keluar,
          a.status_masuk,
          a.status_kehadiran,
          a.dalam_radius,
          m.nama AS mahasiswa_nama,
          m.nim
        FROM absensi a
        INNER JOIN mahasiswa m ON a.mahasiswa_id = m.id
        WHERE m.admin_id = ?
      `;
  
      const params = [adminId];
  
      // Add date filter
      if (startDate && endDate) {
        query += " AND DATE(a.tanggal) BETWEEN ? AND ?";
        params.push(startDate, endDate);
      }
  
      // Add status filter
      if (status && status !== "Semua Status") {
        query += " AND a.status_kehadiran = ?";
        params.push(status.toLowerCase());
      }
  
      // Add search filter
      if (search) {
        query += " AND (m.nama LIKE ? OR m.nim LIKE ?)";
        params.push(`%${search}%`, `%${search}%`);
      }
  
      // Get total count for pagination
      const [totalResult] = await db.execute(
        `SELECT COUNT(*) as total FROM (${query}) as subquery`,
        params
      );
      const total = totalResult[0].total;
  
      // Add pagination
      const offset = (page - 1) * limit;
      query += " ORDER BY a.tanggal DESC, a.waktu_masuk DESC LIMIT ? OFFSET ?";
      params.push(parseInt(limit), offset);
  
      // Execute final query
      const [riwayat] = await db.execute(query, params);
  
      res.json({
        success: true,
        data: riwayat,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit)
      });
    } catch (error) {
      console.error("Get riwayat absensi error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil riwayat absensi"
      });
    }
  },


  getAttendanceStats: async (req, res) => {
    try {
      const mahasiswaId = req.user.mahasiswa_id;

      // Get internship period and total days
      const [internshipData] = await db.execute(
        `SELECT 
        tanggal_mulai, 
        tanggal_selesai,
        DATEDIFF(tanggal_selesai, tanggal_mulai) + 1 as total_days
       FROM mahasiswa 
       WHERE id = ?`,
        [mahasiswaId]
      );

      if (internshipData.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Data magang tidak ditemukan",
        });
      }

      // Get attendance statistics
      const [stats] = await db.execute(
        `SELECT 
        COUNT(*) as total_attendance,
        COUNT(CASE WHEN status_kehadiran = 'hadir' AND status_masuk = 'tepat_waktu' THEN 1 END) as hadir_tepat,
        COUNT(CASE WHEN status_kehadiran = 'izin' THEN 1 END) as izin,
        COUNT(CASE WHEN status_kehadiran = 'alpha' THEN 1 END) as alpha
       FROM absensi 
       WHERE mahasiswa_id = ?`,
        [mahasiswaId]
      );

      res.json({
        success: true,
        data: {
          total_days: internshipData[0].total_days,
          total_attendance: stats[0].total_attendance,
          hadir_tepat: stats[0].hadir_tepat,
          izin: stats[0].izin,
          alpha: stats[0].alpha,
          period: {
            start: internshipData[0].tanggal_mulai,
            end: internshipData[0].tanggal_selesai,
          },
        },
      });
    } catch (error) {
      console.error("Get attendance stats error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil statistik kehadiran",
      });
    }
  },

  getAbsensi: async (req, res) => {
    try {
      const mahasiswaId = req.params.id || req.user.mahasiswa_id;

      let query = `
        SELECT 
          a.id,
          a.tanggal,
          a.waktu_masuk,
          a.waktu_keluar,
          a.status_masuk,
          a.status_kehadiran,
          a.dalam_radius,
          a.latitude_scan,
          a.longitude_scan,
          m.nama AS mahasiswa_nama,
          m.nim
        FROM absensi a
        JOIN mahasiswa m ON a.mahasiswa_id = m.id
        WHERE a.mahasiswa_id = ?
        ORDER BY a.tanggal DESC, a.waktu_masuk DESC
      `;

      const [riwayat] = await db.execute(query, [mahasiswaId]);

      // Optional: Get total for pagination
      const [total] = await db.execute(
        "SELECT COUNT(*) as total FROM absensi WHERE mahasiswa_id = ?",
        [mahasiswaId]
      );

      res.status(200).json({
        success: true,
        data: riwayat,
        total: total[0].total,
      });
    } catch (error) {
      console.error("Get riwayat absensi error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil riwayat absensi",
      });
    }
  },

  getDashboardStats: async (req, res) => {
    try {
      const adminId = req.user.id;
      const today = new Date().toISOString().split("T")[0];

      // Get total active students
      const [totalMahasiswa] = await db.execute(
        'SELECT COUNT(*) as total FROM mahasiswa WHERE admin_id = ? AND status = "aktif"',
        [adminId]
      );

      // Get today's attendance stats
      const [attendanceStats] = await db.execute(
        `SELECT 
          COUNT(CASE WHEN status_kehadiran = 'hadir' THEN 1 END) as hadir,
          COUNT(CASE WHEN status_kehadiran = 'izin' THEN 1 END) as izin,
          COUNT(CASE WHEN status_kehadiran = 'alpha' THEN 1 END) as alpha
         FROM absensi a
         JOIN mahasiswa m ON a.mahasiswa_id = m.id 
         WHERE m.admin_id = ? AND DATE(a.tanggal) = ?`,
        [adminId, today]
      );

      res.json({
        success: true,
        data: {
          totalMahasiswa: totalMahasiswa[0].total,
          ...attendanceStats[0],
        },
      });
    } catch (error) {
      console.error("Get dashboard stats error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil data dashboard",
      });
    }
  },

  // Get statistik absensi
  getAbsensiStatistics: async (req, res) => {
    try {
      const adminId = req.user.id; // admin_id berasal dari token pengguna
      const { startDate, endDate } = req.query;

      // Debug parameter untuk troubleshooting
      console.log("Received query parameters:", { startDate, endDate });

      // Validasi input untuk startDate dan endDate
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Parameter startDate dan endDate harus disediakan",
        });
      }

      // Validasi format tanggal
      const isValidDate = (date) => /^\d{4}-\d{2}-\d{2}$/.test(date);
      if (!isValidDate(startDate) || !isValidDate(endDate)) {
        return res.status(400).json({
          success: false,
          message:
            "Format startDate atau endDate tidak valid. Gunakan format YYYY-MM-DD.",
        });
      }

      // Query untuk mengambil statistik absensi berdasarkan admin_id
      const [statistics] = await db.execute(
        `SELECT 
           DATE(a.tanggal) AS date,
           COUNT(CASE WHEN a.status_kehadiran = 'hadir' THEN 1 END) AS hadir,
           COUNT(CASE WHEN a.status_kehadiran = 'izin' THEN 1 END) AS izin,
           COUNT(CASE WHEN a.status_kehadiran = 'alpha' THEN 1 END) AS alpha
         FROM absensi a
         JOIN mahasiswa m ON a.mahasiswa_id = m.id
         WHERE m.admin_id = ?
           AND DATE(a.tanggal) BETWEEN ? AND ?
         GROUP BY DATE(a.tanggal)
         ORDER BY DATE(a.tanggal)`,
        [adminId, startDate, endDate]
      );

      // Kembalikan hasil statistik
      res.json({
        success: true,
        data: statistics,
      });
    } catch (error) {
      console.error("Get absensi statistics error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil statistik absensi",
      });
    }
  },

  // Tambahkan di absenController.js

  // Get statistik dashboard per hari
  getDashboardStatisticsPerDay: async (req, res) => {
    try {
      const adminId = req.user.id;
      const today = new Date().toISOString().split("T")[0];

      // Get total internship aktif
      const [totalInternship] = await db.execute(
        'SELECT COUNT(*) as total FROM mahasiswa WHERE admin_id = ? AND status = "aktif"',
        [adminId]
      );

      // Get kehadiran hari ini
      const [kehadiranHariIni] = await db.execute(
        `SELECT COUNT(*) as total 
       FROM absensi a
       JOIN mahasiswa m ON a.mahasiswa_id = m.id 
       WHERE m.admin_id = ? 
       AND DATE(a.tanggal) = ?
       AND a.status_kehadiran = 'hadir'`,
        [adminId, today]
      );

      // Get pengajuan izin hari ini
      const [izinHariIni] = await db.execute(
        `SELECT COUNT(*) as total 
       FROM izin i
       JOIN mahasiswa m ON i.mahasiswa_id = m.id 
       WHERE m.admin_id = ? 
       AND DATE(i.created_at) = ?
       AND i.status = 'pending'`,
        [adminId, today]
      );

      // Get logbook pending
      const [logbookPending] = await db.execute(
        `SELECT COUNT(*) as total 
       FROM logbook l
       JOIN mahasiswa m ON l.mahasiswa_id = m.id 
       WHERE m.admin_id = ? 
       AND l.status = 'pending'`,
        [adminId]
      );

      res.json({
        success: true,
        data: {
          totalInternship: totalInternship[0].total || 0,
          kehadiranHariIni: kehadiranHariIni[0].total || 0,
          izinHariIni: izinHariIni[0].total || 0,
          logbookPending: logbookPending[0].total || 0,
        },
      });
    } catch (error) {
      console.error("Get dashboard statistics error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil statistik dashboard",
      });
    }
  },

  // Pengajuan izin
  getKategoriIzin: async (req, res) => {
    try {
      const [categories] = await db.execute("SELECT * FROM kategori_izin");
      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      console.error("Get categories error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil kategori",
      });
    }
  },

  // Submit permission request
  submitIzin: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { tanggal_mulai, tanggal_selesai, kategori, keterangan } = req.body;
      const mahasiswaId = req.user.mahasiswa_id;
      const fileBukti = req.file ? req.file.filename : null;

      // Get admin_id from mahasiswa
      const [mahasiswa] = await connection.execute(
        "SELECT admin_id FROM mahasiswa WHERE id = ?",
        [mahasiswaId]
      );

      if (mahasiswa.length === 0) {
        throw new Error("Mahasiswa tidak ditemukan");
      }

      // Insert permission request
      await connection.execute(
        `INSERT INTO izin (
          mahasiswa_id, admin_id, tanggal_mulai,
          tanggal_selesai, kategori, keterangan,
          file_bukti, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          mahasiswaId,
          mahasiswa[0].admin_id,
          tanggal_mulai,
          tanggal_selesai,
          kategori,
          keterangan,
          fileBukti,
        ]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "Pengajuan izin berhasil dikirim",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Submit izin error:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Terjadi kesalahan saat mengajukan izin",
      });
    } finally {
      connection.release();
    }
  },

  // Update status izin (untuk admin)
  updateStatusIzin: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const izinId = req.params.id;
      const { status, alasan_response } = req.body;
      const adminId = req.user.id;

      // Verify izin belongs to admin
      const [izin] = await connection.execute(
        "SELECT * FROM izin WHERE id = ? AND admin_id = ?",
        [izinId, adminId]
      );

      if (izin.length === 0) {
        await connection.rollback();
        return res.status(404).json({
          success: false,
          message: "Izin tidak ditemukan",
        });
      }

      // Update izin status
      await connection.execute(
        "UPDATE izin SET status = ?, alasan_response = ? WHERE id = ?",
        [status, alasan_response, izinId]
      );

      // If approved, immediately create absensi records
      if (status === "approved") {
        // Get active setting
        const [settings] = await connection.execute(
          "SELECT * FROM setting_absensi WHERE is_active = true"
        );

        if (settings.length === 0) {
          throw new Error("Pengaturan absensi tidak ditemukan");
        }

        const setting = settings[0];
        const startDate = new Date(izin[0].tanggal_mulai);
        const endDate = new Date(izin[0].tanggal_selesai);

        for (
          let date = new Date(startDate);
          date <= endDate;
          date.setDate(date.getDate() + 1)
        ) {
          // Gunakan format YYYY-MM-DD langsung dari tanggal lokal
          const currentDate =
            date.getFullYear() +
            "-" +
            String(date.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(date.getDate()).padStart(2, "0");

          // Cek existing absensi
          const [existingAbsensi] = await connection.execute(
            "SELECT id FROM absensi WHERE mahasiswa_id = ? AND DATE(tanggal) = ?",
            [izin[0].mahasiswa_id, currentDate]
          );

          if (existingAbsensi.length === 0) {
            await connection.execute(
              `INSERT INTO absensi (
                mahasiswa_id,
                setting_absensi_id,
                tanggal,
                waktu_masuk,
                waktu_keluar,
                status_masuk,
                status_kehadiran,
                dalam_radius
              ) VALUES (?, ?, ?, ?, ?, 'tepat_waktu', 'izin', true)`,
              [
                izin[0].mahasiswa_id,
                setting.id,
                currentDate,
                setting.jam_masuk,
                setting.jam_pulang,
              ]
            );
          }
        }
      }

      await connection.commit();

      // Get updated data for response
      const [updatedIzin] = await connection.execute(
        `SELECT 
        i.*,
        m.nama as mahasiswa_nama,
        m.nim
       FROM izin i
       JOIN mahasiswa m ON i.mahasiswa_id = m.id
       WHERE i.id = ?`,
        [izinId]
      );

      res.json({
        success: true,
        message: `Izin berhasil ${
          status === "approved" ? "disetujui" : "ditolak"
        }`,
        data: updatedIzin[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update status izin error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat memproses izin",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    } finally {
      connection.release();
    }
  },

  // Get riwayat izin (continued...)
  getRiwayatIzin: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const userId = req.user.mahasiswa_id || req.user.admin_id;
      const userRole = req.user.role;

      let query = `
        SELECT 
          i.*,
          m.nama as mahasiswa_nama,
          m.nim,
          a.nama as admin_nama,
          DATE_FORMAT(i.tanggal_mulai, '%Y-%m-%d') as tanggal_mulai,
          DATE_FORMAT(i.tanggal_selesai, '%Y-%m-%d') as tanggal_selesai,
          DATE_FORMAT(i.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
          DATEDIFF(i.tanggal_selesai, i.tanggal_mulai) + 1 as total_hari
        FROM izin i
        JOIN mahasiswa m ON i.mahasiswa_id = m.id
        JOIN admin a ON i.admin_id = a.id
        WHERE `;

      const params = [];

      if (userRole === "mahasiswa") {
        query += "i.mahasiswa_id = ?";
        params.push(userId);
      } else {
        query += "i.admin_id = ?";
        params.push(userId);
      }

      query += " ORDER BY i.created_at DESC";

      const [riwayat] = await connection.execute(query, params);

      res.json({
        success: true,
        data: riwayat,
      });
    } catch (error) {
      console.error("Get riwayat izin error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil riwayat izin",
      });
    } finally {
      connection.release();
    }
  },

  exportAbsensiAdmin: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      const { selectedIds } = req.body;
      const adminId = req.user.admin_id;
  
      if (!selectedIds || !Array.isArray(selectedIds) || selectedIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Pilih setidaknya satu data untuk diekspor"
        });
      }
  
      const placeholders = selectedIds.map(() => "?").join(",");
      const query = `
        SELECT 
          a.id,
          m.nim,
          m.nama as mahasiswa_nama,
          DATE_FORMAT(a.tanggal, '%d/%m/%Y') as tanggal,
          TIME_FORMAT(a.waktu_masuk, '%H:%i') as waktu_masuk,
          TIME_FORMAT(a.waktu_keluar, '%H:%i') as waktu_keluar,
          a.status_kehadiran,
          a.status_masuk,
          a.dalam_radius
        FROM absensi a
        INNER JOIN mahasiswa m ON a.mahasiswa_id = m.id
        WHERE a.id IN (${placeholders})
        AND m.admin_id = ?
        ORDER BY a.tanggal DESC, m.nama ASC
      `;
  
      const [data] = await connection.execute(query, [...selectedIds, adminId]);
  
      if (data.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Tidak ada data untuk diekspor"
        });
      }
  
      // Get admin info with paraf
      const [adminInfo] = await connection.execute(
        "SELECT nama, paraf_image FROM admin WHERE id = ?",
        [adminId]
      );
      const adminName = adminInfo[0]?.nama || "Admin";
  
      // Create PDF
      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 40,
          bottom: 40,
          left: 40,
          right: 40
        },
        bufferPages: true
      });
  
      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Absensi_Admin_${new Date().toISOString().split('T')[0]}.pdf`
      );
  
      doc.pipe(res);
  
      // Header with logos
      const createHeader = () => {
        const logoPath = path.join(__dirname, '../uploads/assets');
        const semenPadangLogo = path.join(logoPath, 'semen-padang-logo.png');
        const sigLogo = path.join(logoPath, 'sig-logo.png');
  
        if (fs.existsSync(semenPadangLogo)) {
          doc.image(semenPadangLogo, 60, 40, { width: 60 });
        }
        
        if (fs.existsSync(sigLogo)) {
          doc.image(sigLogo, 495, 40, { width: 60 });
        }
  
        doc.font('Helvetica-Bold')
           .fontSize(16)
           .text('SISTEM MONITORING MAGANG', 160, 50, { align: 'center', width: 300 })
           .fontSize(14)
           .text('Laporan Absensi Magang', 160, 75, { align: 'center', width: 300 });
  
        doc.moveTo(60, 110)
           .lineTo(535, 110)
           .lineWidth(0.5)
           .strokeColor('#e0e0e0')
           .stroke();
      };
  
      createHeader();
  
      createHeader();
  
      // Metadata
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .moveDown(2.5)
        .text(`Admin: ${adminName}`, 40)
        .text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID")}`)
        .text(`Total Data: ${data.length} record`)
        .moveDown(0.5);
  
      // Table dimensions
      const startX = 40;
      const colWidths = [25, 65, 85, 60, 60, 60, 50, 55, 55]; // Total = 515
      let y = doc.y + 5;
  
      // Table headers
      const tableHeaders = [
        "No",
        "NIM",
        "Nama",
        "Tanggal",
        "Waktu Masuk",
        "Waktu Keluar",
        "Status",
        "Ketepatan",
        "Lokasi"
      ];
  
      const drawTableHeader = (yPosition) => {
        doc.font("Helvetica-Bold").fontSize(8);
        let x = startX;
  
        // Header background
        doc
          .fillColor("#f3f4f6")
          .rect(x, yPosition, colWidths.reduce((a, b) => a + b, 0), 18)
          .fill();
  
        // Header text
        doc.fillColor("#444444");
        tableHeaders.forEach((header, i) => {
          doc.text(header, x + 2, yPosition + 5, {
            width: colWidths[i] - 4,
            align: "center"
          });
          x += colWidths[i];
        });
      };
  
      drawTableHeader(y);
  
      // Table rows
      y += 18;
      doc.font("Helvetica").fontSize(8);
  
      data.forEach((record, index) => {
        if (y > 700) {
          doc.addPage();
          createHeader();
          y = 150;
          drawTableHeader(y);
          y += 18;
        }
  
        // Row background
        if (index % 2 === 0) {
          doc
            .fillColor("#fafafa")
            .rect(startX, y, colWidths.reduce((a, b) => a + b, 0), 18)
            .fill();
        }
  
        let x = startX;
        doc.fillColor("#444444");
  
        // Draw cells
        [
          (index + 1).toString(),
          record.nim,
          record.mahasiswa_nama,
          record.tanggal,
          record.waktu_masuk || "-",
          record.waktu_keluar || "-",
          record.status_kehadiran,
          record.status_masuk === "tepat_waktu" ? "Tepat Waktu" : "Telat",
          record.dalam_radius ? "Dalam Radius" : "Luar Radius"
        ].forEach((text, i) => {
          if (i === 6) { // Status
            const statusColors = {
              hadir: { bg: "#e8f5e9", text: "#1a8754" },
              izin: { bg: "#fff3e0", text: "#fd7e14" },
              alpha: { bg: "#fee2e2", text: "#dc3545" }
            };
            
            const color = statusColors[record.status_kehadiran] || { bg: "#f3f4f6", text: "#444444" };
            
            doc
              .fillColor(color.bg)
              .roundedRect(x + 2, y + 2, colWidths[i] - 4, 14, 3)
              .fill()
              .fillColor(color.text)
              .text(text.charAt(0).toUpperCase() + text.slice(1),
                x + 2, y + 4,
                { width: colWidths[i] - 4, align: "center" }
              );
          } else if (i === 7 || i === 8) { // Ketepatan & Lokasi
            const isPositive = text.includes("Tepat") || text.includes("Dalam");
            doc
              .fillColor(isPositive ? "#e8f5e9" : "#fee2e2")
              .roundedRect(x + 2, y + 2, colWidths[i] - 4, 14, 3)
              .fill()
              .fillColor(isPositive ? "#1a8754" : "#dc3545")
              .text(text, x + 2, y + 4, {
                width: colWidths[i] - 4,
                align: "center"
              });
          } else {
            doc.text(text, x + 2, y + 5, {
              width: colWidths[i] - 4,
              align: i === 0 ? "center" : "left"
            });
          }
          x += colWidths[i];
        });
  
        y += 18;
      });
  
      // Add signature section
      y += 50;
      const signatureDate = new Date().toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
  
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .text(`Padang, ${signatureDate}`, 400, y)
        .text("Pembimbing Lapangan,", 402, y + 20);
  
      y += 40;
  
      // Add paraf with proper buffer handling
      if (adminInfo[0]?.paraf_image) {
        try {
          const parafImagePath = Buffer.isBuffer(adminInfo[0].paraf_image)
            ? adminInfo[0].paraf_image.toString("utf8")
            : adminInfo[0].paraf_image;
  
          const parafPath = path.join(process.cwd(), parafImagePath);
  
          if (fs.existsSync(parafPath)) {
            doc.image(parafPath, 405, y, {
              fit: [100, 50],
              align: "center",
              valign: "center"
            });
            y += 50;
          } else {
            doc.text("(Paraf Digital)", 400, y);
            y += 30;
          }
        } catch (error) {
          console.error("Error adding paraf:", error);
          doc.text("(Paraf Digital)", 400, y);
          y += 30;
        }
      } else {
        doc.text("(Paraf Digital)", 400, y);
        y += 30;
      }
  
      // Add admin name
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .text(adminName, 415, y + 10);
  
      // Footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        doc
          .moveTo(40, doc.page.height - 40)
          .lineTo(552, doc.page.height - 40)
          .lineWidth(0.5)
          .strokeColor("#e0e0e0")
          .stroke();
  
        doc
          .fontSize(8)
          .fillColor("#666666")
          .text(
            `PT Semen Padang - Sistem Monitoring Magang | Halaman ${i + 1} dari ${range.count}`,
            40,
            doc.page.height - 30,
            { align: "center" }
          );
      }
  
      doc.end();
  
    } catch (error) {
      console.error("Export error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Gagal mengekspor data"
        });
      }
    } finally {
      connection.release();
    }
  },

  exportAbsensiMahasiswa: async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      const { selectedIds } = req.body;
      const mahasiswaId = req.user.mahasiswa_id;
  
      if (!selectedIds || !Array.isArray(selectedIds) || selectedIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Pilih setidaknya satu data absensi untuk diekspor"
        });
      }
  
      const placeholders = selectedIds.map(() => "?").join(",");
      
      // Get mahasiswa and admin info
      const [userInfo] = await connection.execute(
        `SELECT 
          m.nama as mahasiswa_nama,
          m.nim,
          m.institusi,
          a.nama as admin_nama,
          a.paraf_image
        FROM mahasiswa m
        JOIN admin a ON m.admin_id = a.id
        WHERE m.id = ?`,
        [mahasiswaId]
      );
  
      if (!userInfo[0]) {
        throw new Error("Data mahasiswa tidak ditemukan");
      }
  
      // Get attendance data
      const [data] = await connection.execute(
        `SELECT
          DATE_FORMAT(a.tanggal, '%d/%m/%Y') as tanggal,
          a.status_kehadiran,
          TIME_FORMAT(a.waktu_masuk, '%H:%i') as waktu_masuk,
          TIME_FORMAT(a.waktu_keluar, '%H:%i') as waktu_keluar,
          a.status_masuk as ketepatan_waktu,
          a.dalam_radius
        FROM absensi a
        WHERE a.mahasiswa_id = ? AND a.id IN (${placeholders})
        ORDER BY a.tanggal DESC`,
        [mahasiswaId, ...selectedIds]
      );
  
      if (data.length === 0) {
        throw new Error("Tidak ada data untuk diekspor");
      }
  
      // Create PDF
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true
      });
  
      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=Absensi_${userInfo[0].nim}_${new Date().toISOString().split("T")[0]}.pdf`
      );
  
      doc.pipe(res);
  
      // Header with logos
      const createHeader = () => {
        const logoPath = path.join(__dirname, '../uploads/assets');
        const semenPadangLogo = path.join(logoPath, 'semen-padang-logo.png');
        const sigLogo = path.join(logoPath, 'sig-logo.png');
  
        if (fs.existsSync(semenPadangLogo)) {
          doc.image(semenPadangLogo, 60, 40, { width: 60 });
        }
        
        if (fs.existsSync(sigLogo)) {
          doc.image(sigLogo, 495, 40, { width: 60 });
        }
  
        doc.font('Helvetica-Bold')
           .fontSize(16)
           .text('SISTEM MONITORING MAGANG', 160, 50, { align: 'center', width: 300 })
           .fontSize(14)
           .text('Laporan Absensi Magang', 160, 75, { align: 'center', width: 300 });
  
        doc.moveTo(60, 110)
           .lineTo(535, 110)
           .lineWidth(0.5)
           .strokeColor('#e0e0e0')
           .stroke();
      };
  
      createHeader();
  
      // Metadata
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .moveDown(2.5)  // Reduced from 2.5 to reduce space after header line
        .text(`Nama: ${userInfo[0].mahasiswa_nama}`, 40)
        .text(`NIM: ${userInfo[0].nim}`)
        .text(`Institusi: ${userInfo[0].institusi}`)
        .text(`Tanggal Cetak: ${new Date().toLocaleDateString("id-ID")}`)
        .text(`Total Data: ${data.length} record`)
        .moveDown(1.9);  // Added specific spacing before table
  
      // Table configuration
      const startX = 40;
      const colWidths = {
        no: 30,
        tanggal: 70,
        status: 70,
        waktuMasuk: 70,
        waktuKeluar: 70,
        ketepatan: 90,
        lokasi: 90
      };
  
      // Table headers
      const headers = {
        "No": colWidths.no,
        "Tanggal": colWidths.tanggal,
        "Status": colWidths.status,
        "Waktu Masuk": colWidths.waktuMasuk,
        "Waktu Keluar": colWidths.waktuKeluar,
        "Ketepatan": colWidths.ketepatan,
        "Lokasi": colWidths.lokasi
      };
  
      // Calculate total width
      const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);
  
      const drawTableHeader = (yPosition) => {
        let xPosition = startX;
        
        // Header background
        doc
          .fillColor("#f3f4f6")
          .rect(xPosition, yPosition, totalWidth, 20)
          .fill();
  
        // Header text
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#444444");
  
        Object.entries(headers).forEach(([title, width]) => {
          doc.text(title, xPosition + 2, yPosition + 5, {
            width: width - 4,
            align: "center"
          });
          xPosition += width;
        });
      };
  
      // Initialize table position
      let yPos = doc.y;
      drawTableHeader(yPos);
      yPos += 20;
  
      // Content rows
      doc.font("Helvetica").fontSize(9);
  
      data.forEach((record, index) => {
        const rowHeight = 20;
  
        // Check if new page is needed
        if (yPos + rowHeight > 700) {
          doc.addPage();
          createHeader();
          yPos = 150;
          drawTableHeader(yPos);
          yPos += 20;
        }
  
        let xPos = startX;
  
        // Alternate row backgrounds
        if (index % 2 === 0) {
          doc
            .fillColor("#fafafa")
            .rect(xPos, yPos, totalWidth, rowHeight)
            .fill();
        }
  
        // Draw cells
        // No
        doc
          .fillColor("#444444")
          .text((index + 1).toString(), xPos + 2, yPos + 5, {
            width: colWidths.no - 4,
            align: "center"
          });
        xPos += colWidths.no;
  
        // Tanggal
        doc.text(record.tanggal, xPos + 2, yPos + 5, {
          width: colWidths.tanggal - 4,
          align: "left"
        });
        xPos += colWidths.tanggal;
  
        // Status with color
        const statusColors = {
          hadir: { bg: "#e8f5e9", text: "#1a8754" },
          izin: { bg: "#fff3e0", text: "#fd7e14" },
          alpha: { bg: "#fee2e2", text: "#dc3545" }
        };
  
        const statusColor = statusColors[record.status_kehadiran] || { bg: "#f3f4f6", text: "#444444" };
        const statusText = record.status_kehadiran.charAt(0).toUpperCase() + record.status_kehadiran.slice(1);
        
        doc
          .fillColor(statusColor.bg)
          .roundedRect(xPos + 5, yPos + 2, colWidths.status - 10, rowHeight - 4, 3)
          .fill()
          .fillColor(statusColor.text)
          .text(statusText, xPos, yPos + 5, {
            width: colWidths.status,
            align: "center"
          });
        xPos += colWidths.status;
  
        // Waktu Masuk
        doc
          .fillColor("#444444")
          .text(record.waktu_masuk || "-", xPos + 2, yPos + 5, {
            width: colWidths.waktuMasuk - 4,
            align: "center"
          });
        xPos += colWidths.waktuMasuk;
  
        // Waktu Keluar
        doc.text(record.waktu_keluar || "-", xPos + 2, yPos + 5, {
          width: colWidths.waktuKeluar - 4,
          align: "center"
        });
        xPos += colWidths.waktuKeluar;
  
        // Ketepatan Waktu
        const ketepatanText = record.ketepatan_waktu === "tepat_waktu" ? "Tepat Waktu" : "Telat";
        const isTepatWaktu = record.ketepatan_waktu === "tepat_waktu";
        
        doc
          .fillColor(isTepatWaktu ? "#e8f5e9" : "#fee2e2")
          .roundedRect(xPos + 5, yPos + 2, colWidths.ketepatan - 10, rowHeight - 4, 3)
          .fill()
          .fillColor(isTepatWaktu ? "#1a8754" : "#dc3545")
          .text(ketepatanText, xPos, yPos + 5, {
            width: colWidths.ketepatan,
            align: "center"
          });
        xPos += colWidths.ketepatan;
  
        // Lokasi
        const lokasiText = record.dalam_radius ? "Dalam Radius" : "Luar Radius";
        doc
          .fillColor(record.dalam_radius ? "#e8f5e9" : "#fee2e2")
          .roundedRect(xPos + 5, yPos + 2, colWidths.lokasi - 10, rowHeight - 4, 3)
          .fill()
          .fillColor(record.dalam_radius ? "#1a8754" : "#dc3545")
          .text(lokasiText, xPos, yPos + 5, {
            width: colWidths.lokasi,
            align: "center"
          });
  
        yPos += rowHeight;
      });
  
      // Add signature section
      yPos += 50;
      const signatureDate = new Date().toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric"
      });
  
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .text(`Padang, ${signatureDate}`, 400, yPos)
        .text("Pembimbing Lapangan,", 402, yPos + 20);
  
      yPos += 40;
  
      // Add paraf with proper buffer handling
      if (userInfo[0].paraf_image) {
        try {
          const parafImagePath = Buffer.isBuffer(userInfo[0].paraf_image)
            ? userInfo[0].paraf_image.toString("utf8")
            : userInfo[0].paraf_image;
  
          const parafPath = path.join(process.cwd(), parafImagePath);
  
          if (fs.existsSync(parafPath)) {
            doc.image(parafPath, 405, yPos, {
              fit: [100, 50],
              align: "center",
              valign: "center"
            });
            yPos += 50;
          } else {
            doc.text("(Paraf Digital)", 400, yPos);
            yPos += 30;
          }
        } catch (error) {
          console.error("Error adding paraf:", error);
          doc.text("(Paraf Digital)", 400, yPos);
          yPos += 30;
        }
      } else {
        doc.text("(Paraf Digital)", 400, yPos);
        yPos += 30;
      }
  
      // Add admin name
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .text(userInfo[0].admin_nama, 415, yPos + 10);
  
      // Add footer
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
  
        doc
          .moveTo(40, doc.page.height - 50)
          .lineTo(552, doc.page.height - 50)
          .lineWidth(0.5)
          .strokeColor("#e0e0e0")
          .stroke();
  
        doc
          .fontSize(8)
          .fillColor("#666666")
          .text(
            `PT Semen Padang - Sistem Monitoring Magang | Halaman ${i + 1} dari ${range.count}`,
            40,
            doc.page.height - 35,
            { align: "center" }
          );
      }
  
      doc.end();
    } catch (error) {
      console.error("Export error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Gagal mengekspor data",
          error: error.message
        });
      }
    } finally {
      connection.release();
    }
  },

  // Get status absensi hari ini
  getStatusAbsensiHariIni: async (req, res) => {
    try {
      const mahasiswaId = req.user.mahasiswa_id;
      const today = new Date().toISOString().split("T")[0];

      const [absensi] = await db.execute(
        `SELECT a.*, s.jam_masuk, s.jam_pulang
         FROM absensi a
         JOIN setting_absensi s ON a.setting_absensi_id = s.id
         WHERE a.mahasiswa_id = ? AND DATE(a.tanggal) = ?`,
        [mahasiswaId, today]
      );

      // Get active settings
      const [settings] = await db.execute(
        "SELECT * FROM setting_absensi WHERE is_active = true"
      );

      res.json({
        success: true,
        data: {
          absensi: absensi[0] || null,
          setting: settings[0] || null,
        },
      });
    } catch (error) {
      console.error("Get status absensi hari ini error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil status absensi",
      });
    }
  },

  // Update setting absensi
  updateSettingAbsensi: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const {
        jam_masuk,
        jam_pulang,
        batas_telat_menit,
        radius_meter,
        latitude_pusat,
        longitude_pusat,
      } = req.body;

      // Deactivate current active setting
      await connection.execute(
        "UPDATE setting_absensi SET is_active = false WHERE is_active = true"
      );

      // Create new setting
      await connection.execute(
        `INSERT INTO setting_absensi (
          jam_masuk, jam_pulang, batas_telat_menit,
          radius_meter, latitude_pusat, longitude_pusat,
          is_active, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, true, ?)`,
        [
          jam_masuk,
          jam_pulang,
          batas_telat_menit,
          radius_meter,
          latitude_pusat,
          longitude_pusat,
          req.user.id,
        ]
      );

      await connection.commit();

      res.json({
        success: true,
        message: "Setting absensi berhasil diupdate",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update setting absensi error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat update setting absensi",
      });
    } finally {
      connection.release();
    }
  },
};

module.exports = absenController;
