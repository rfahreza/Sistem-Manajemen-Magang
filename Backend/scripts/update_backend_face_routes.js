const fs = require('fs');
const path = require('path');

// 1. Update absenRoutes.js
const absenRoutesPath = path.join(__dirname, '../routes/absenRoutes.js');
let absenRoutes = fs.readFileSync(absenRoutesPath, 'utf8');

if (!absenRoutes.includes('/face-descriptors')) {
  absenRoutes = absenRoutes.replace(
    '// QR Code scan',
    `// Face Recognition scan & descriptors
router.get("/face-descriptors", absenController.getFaceDescriptors);
router.post("/scan-face", absenController.scanFace);

// QR Code scan`
  );
  fs.writeFileSync(absenRoutesPath, absenRoutes, 'utf8');
  console.log('Updated absenRoutes.js');
} else {
  console.log('absenRoutes.js already has face routes');
}

// 2. Update absenController.js
const absenControllerPath = path.join(__dirname, '../controllers/absenController.js');
let absenController = fs.readFileSync(absenControllerPath, 'utf8');

if (!absenController.includes('getFaceDescriptors:')) {
  const methodsToAdd = `
  // Get all active face descriptors for Kiosk
  getFaceDescriptors: async (req, res) => {
    try {
      const [rows] = await db.execute(
        "SELECT id AS mahasiswa_id, nama, nim, face_descriptor FROM mahasiswa WHERE status = 'aktif' AND face_descriptor IS NOT NULL"
      );
      const parsed = rows.map(r => {
        let descriptor = null;
        try {
          descriptor = typeof r.face_descriptor === 'string' ? JSON.parse(r.face_descriptor) : r.face_descriptor;
        } catch (e) {
          descriptor = null;
        }
        return {
          mahasiswa_id: r.mahasiswa_id,
          nama: r.nama,
          nim: r.nim,
          face_descriptor: descriptor
        };
      }).filter(r => Array.isArray(r.face_descriptor) && r.face_descriptor.length > 0);

      return res.json({
        success: true,
        data: parsed
      });
    } catch (error) {
      console.error("Get face descriptors error:", error);
      return res.status(500).json({
        success: false,
        message: "Gagal memuat data wajah mahasiswa"
      });
    }
  },

  // Scan face attendance for Kiosk
  scanFace: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const { mahasiswa_id, latitude, longitude, deviceInfo, photo } = req.body;
      if (!mahasiswa_id) {
        res.setHeader('X-Play-Sound', 'error');
        return res.status(400).json({
          success: false,
          message: "ID Mahasiswa tidak teridentifikasi"
        });
      }

      const [mahasiswa] = await connection.execute(
        'SELECT * FROM mahasiswa WHERE id = ? AND status = "aktif"',
        [mahasiswa_id]
      );
      if (mahasiswa.length === 0) {
        res.setHeader('X-Play-Sound', 'error');
        return res.status(404).json({
          success: false,
          message: "Mahasiswa tidak ditemukan atau tidak aktif"
        });
      }

      const [settings] = await connection.execute(
        "SELECT * FROM setting_absensi WHERE is_active = true"
      );
      if (settings.length === 0) {
        res.setHeader('X-Play-Sound', 'error');
        return res.status(400).json({
          success: false,
          message: "Pengaturan absensi belum dikonfigurasi"
        });
      }

      const setting = settings[0];

      let dalamRadius = true;
      if (latitude && longitude && setting.latitude_pusat && setting.longitude_pusat) {
        const distance = geolib.getDistance(
          { latitude: Number(latitude), longitude: Number(longitude) },
          {
            latitude: Number(setting.latitude_pusat),
            longitude: Number(setting.longitude_pusat),
          }
        );
        dalamRadius = distance <= setting.radius_meter;
      }

      let photoPath = null;
      if (photo && typeof photo === 'string' && photo.startsWith('data:image')) {
        try {
          const matches = photo.match(/^data:image\\/([A-Za-z-+\\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const filename = \`face-\${mahasiswa_id}-\${Date.now()}.\${ext}\`;
            const uploadDir = path.join(__dirname, '../uploads/absensi');
            if (!fs.existsSync(uploadDir)) {
              fs.mkdirSync(uploadDir, { recursive: true });
            }
            fs.writeFileSync(path.join(uploadDir, filename), buffer);
            photoPath = \`absensi/\${filename}\`;
          }
        } catch (saveErr) {
          console.warn("Gagal menyimpan snapshot wajah:", saveErr);
        }
      }

      const now = new Date();
      const currentTime = now.toTimeString().split(" ")[0];
      const currentDate = now.toISOString().split("T")[0];

      const [existingAbsensi] = await connection.execute(
        "SELECT * FROM absensi WHERE mahasiswa_id = ? AND DATE(tanggal) = ?",
        [mahasiswa_id, currentDate]
      );

      if (existingAbsensi.length === 0) {
        let statusMasuk = "tepat_waktu";
        if (currentTime > setting.jam_masuk) {
          const timeDiff =
            (new Date(\`2000/01/01 \${currentTime}\`) -
              new Date(\`2000/01/01 \${setting.jam_masuk}\`)) /
            1000 /
            60;
          if (timeDiff > setting.batas_telat_menit) {
            statusMasuk = "telat";
          }
        }

        await connection.execute(
          \`INSERT INTO absensi (
            mahasiswa_id, setting_absensi_id, tanggal,
            waktu_masuk, status_masuk, status_kehadiran,
            latitude_scan, longitude_scan, dalam_radius,
            device_info, face_photo
          ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, 'hadir', ?, ?, ?, ?, ?)\`,
          [
            mahasiswa_id,
            setting.id,
            currentDate,
            statusMasuk,
            latitude || null,
            longitude || null,
            dalamRadius ? 1 : 0,
            deviceInfo || null,
            photoPath
          ]
        );

        await connection.commit();
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
        if (existingAbsensi[0].waktu_keluar !== null) {
          res.setHeader('X-Play-Sound', 'error');
          return res.status(400).json({
            success: false,
            message: "Anda sudah absen pulang",
          });
        }

        if (currentTime < setting.jam_pulang) {
          res.setHeader('X-Play-Sound', 'error');
          return res.status(400).json({
            success: false,
            message: "Belum waktunya pulang",
          });
        }

        await connection.execute(
          \`UPDATE absensi 
           SET waktu_keluar = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               face_photo = COALESCE(?, face_photo)
           WHERE id = ? 
           AND waktu_keluar IS NULL\`,
          [photoPath, existingAbsensi[0].id]
        );

        await connection.commit();
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
      console.error("Scan Face error:", error);
      res.setHeader('X-Play-Sound', 'error');
      return res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat proses absensi wajah",
      });
    } finally {
      connection.release();
    }
  },
`;

  absenController = absenController.replace(
    'const absenController = {',
    'const absenController = {' + methodsToAdd
  );
  fs.writeFileSync(absenControllerPath, absenController, 'utf8');
  console.log('Updated absenController.js');
} else {
  console.log('absenController.js already has getFaceDescriptors');
}

// 3. Update userRoutes.js
const userRoutesPath = path.join(__dirname, '../routes/userRoutes.js');
let userRoutes = fs.readFileSync(userRoutesPath, 'utf8');

if (!userRoutes.includes('/face-register')) {
  userRoutes = userRoutes.replace(
    "router.get('/profile',",
    `// Face Recognition registration
router.post('/face-register', auth.isMahasiswa, userController.registerFace);
router.delete('/face', auth.isMahasiswa, userController.deleteFace);

router.get('/profile',`
  );
  fs.writeFileSync(userRoutesPath, userRoutes, 'utf8');
  console.log('Updated userRoutes.js');
} else {
  console.log('userRoutes.js already has face-register route');
}

// 4. Update userController.js
const userControllerPath = path.join(__dirname, '../controllers/userController.js');
let userController = fs.readFileSync(userControllerPath, 'utf8');

// Update getProfile to include is_face_registered
if (!userController.includes('is_face_registered')) {
  userController = userController.replace(
    'm.status, m.sisa_hari',
    'm.status, m.sisa_hari, (m.face_descriptor IS NOT NULL) AS is_face_registered'
  );
}

if (!userController.includes('registerFace:')) {
  const userFaceMethods = `
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
`;

  userController = userController.replace(
    'const userController = {',
    'const userController = {' + userFaceMethods
  );
  fs.writeFileSync(userControllerPath, userController, 'utf8');
  console.log('Updated userController.js');
} else {
  console.log('userController.js already has registerFace');
}

console.log('Backend routes and controllers updated successfully!');
