const db = require("../config/database");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const logbookController = {
  // Get logbook by mahasiswa/admin
  getLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const userId = req.user.mahasiswa_id || req.user.admin_id;
      const userRole = req.user.role;
      const { date, status, search } = req.query;

      let query = `
        SELECT 
          l.*,
          m.nama as mahasiswa_nama,
          m.nim,
          DATE_FORMAT(l.tanggal, '%Y-%m-%d') as tanggal
        FROM logbook l
        JOIN mahasiswa m ON l.mahasiswa_id = m.id
        WHERE `;

      // Add role-specific filter
      if (userRole === "mahasiswa") {
        query += "l.mahasiswa_id = ?";
      } else {
        query += "l.admin_id = ?";
      }

      const params = [userId];

      // Add date filter if provided
      if (date) {
        query += ` AND DATE(l.tanggal) = DATE(?)`;
        params.push(date);
      }

      // Add status filter if provided
      if (status) {
        query += ` AND l.status = ?`;
        params.push(status);
      }

      // Add search filter if provided
      if (search) {
        query += ` AND (
          m.nama LIKE ? OR 
          m.nim LIKE ? OR 
          l.aktivitas LIKE ?
        )`;
        const searchParam = `%${search}%`;
        params.push(searchParam, searchParam, searchParam);
      }

      // Add sorting
      query += ` ORDER BY l.tanggal ASC, l.created_at ASC`;

      console.log("Query:", query);
      console.log("Params:", params);

      const [logbooks] = await connection.execute(query, params);

      res.json({
        success: true,
        data: logbooks,
      });
    } catch (error) {
      console.error("Error getting logbooks:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil data logbook",
      });
    } finally {
      connection.release();
    }
  },

  // Submit logbook baru
  submitLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const mahasiswaId = req.user.mahasiswa_id;
      const adminId = req.user.admin_id;
      const { tanggal, aktivitas, progress } = req.body;
      const fileDokumentasi = req.file ? req.file.filename : null;

      // Validasi input
      if (!tanggal || !aktivitas || !progress) {
        throw new Error("Semua field wajib diisi");
      }

      if (isNaN(progress) || progress < 0 || progress > 100) {
        throw new Error("Progress harus berupa angka antara 0-100");
      }

      // Cek duplikasi tanggal
      const [existingLogbook] = await connection.execute(
        "SELECT id FROM logbook WHERE mahasiswa_id = ? AND tanggal = ?",
        [mahasiswaId, tanggal]
      );

      if (existingLogbook.length > 0) {
        throw new Error("Logbook untuk tanggal ini sudah ada");
      }

      // Insert logbook
      const [result] = await connection.execute(
        `INSERT INTO logbook (
          mahasiswa_id, 
          admin_id, 
          tanggal,
          aktivitas, 
          progress, 
          file_dokumentasi,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
        [mahasiswaId, adminId, tanggal, aktivitas, progress, fileDokumentasi]
      );

      await connection.commit();

      // Get inserted data
      const [newLogbook] = await connection.execute(
        `SELECT 
          l.*,
          m.nama as mahasiswa_nama,
          m.nim,
          DATE_FORMAT(l.tanggal, '%Y-%m-%d') as tanggal
        FROM logbook l
        JOIN mahasiswa m ON l.mahasiswa_id = m.id
        WHERE l.id = ?`,
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        message: "Logbook berhasil disimpan",
        data: newLogbook[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Submit logbook error:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } finally {
      connection.release();
    }
  },

  updateRejectedLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const logbookId = req.params.logbookId;
      const mahasiswaId = req.user.mahasiswa_id;

      // Verify ownership and rejected status
      const [logbook] = await connection.execute(
        'SELECT * FROM logbook WHERE id = ? AND mahasiswa_id = ? AND status = "rejected"',
        [logbookId, mahasiswaId]
      );

      if (logbook.length === 0) {
        throw new Error(
          "Logbook tidak ditemukan atau Anda tidak memiliki akses"
        );
      }

      const { aktivitas, progress } = req.body;

      // Validasi input
      if (!aktivitas || !progress) {
        throw new Error("Aktivitas dan progress harus diisi");
      }

      if (isNaN(progress) || progress < 0 || progress > 100) {
        throw new Error("Progress harus berupa angka antara 0-100");
      }

      // Update logbook (tanpa mengubah tanggal)
      await connection.execute(
        `UPDATE logbook 
         SET aktivitas = ?, 
             progress = ?,
             status = 'pending',
             catatan_admin = NULL,
             paraf_admin = NULL,
             updated_at = NOW()
         WHERE id = ?`,
        [aktivitas, progress, logbookId]
      );

      await connection.commit();

      // Get updated data
      const [updatedLogbook] = await connection.execute(
        `SELECT 
          l.*, 
          m.nama as mahasiswa_nama, 
          m.nim,
          DATE_FORMAT(l.tanggal, '%Y-%m-%d') as tanggal,
          IF(l.paraf_admin IS NOT NULL, true, false) as is_signed
         FROM logbook l
         JOIN mahasiswa m ON l.mahasiswa_id = m.id
         WHERE l.id = ?`,
        [logbookId]
      );

      res.json({
        success: true,
        message: "Logbook berhasil diperbarui",
        data: updatedLogbook[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update logbook error:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  // Update status logbook (untuk admin)
  updateLogbookStatus: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { logbookId } = req.params;
      const { status, catatan_admin } = req.body;
      const adminId = req.user.admin_id;

      // Validasi input
      if (!status || !["pending", "approved", "rejected"].includes(status)) {
        throw new Error("Status tidak valid");
      }

      // Jika status rejected, catatan admin harus diisi
      if (status === "rejected" && !catatan_admin) {
        throw new Error("Catatan admin harus diisi untuk status rejected");
      }

      // Verify logbook belongs to admin
      const [logbook] = await connection.execute(
        "SELECT * FROM logbook WHERE id = ? AND admin_id = ?",
        [logbookId, adminId]
      );

      if (logbook.length === 0) {
        throw new Error("Logbook tidak ditemukan");
      }

      // Buat query update
      const updateFields = ["status = ?"];
      const updateValues = [status];

      // Tambahkan catatan_admin jika ada
      if (status === "rejected") {
        updateFields.push("catatan_admin = ?");
        updateValues.push(catatan_admin);
        updateFields.push("paraf_admin = NULL");
      } else if (status === "approved") {
        // Get admin's name for paraf text
        const [adminData] = await connection.execute(
          "SELECT nama FROM admin WHERE id = ?",
          [adminId]
        );

        if (adminData.length > 0) {
          const parafText = `Diparaf oleh ${
            adminData[0].nama
          } pada ${new Date().toLocaleString("id-ID")}`;
          updateFields.push("paraf_admin = ?");
          updateValues.push(parafText);
          updateFields.push("catatan_admin = NULL");
        }
      }

      updateFields.push("updated_at = NOW()");

      // Tambahkan logbookId ke values array
      updateValues.push(logbookId);

      // Update logbook status
      const updateQuery = `
        UPDATE logbook 
        SET ${updateFields.join(", ")}
        WHERE id = ?
      `;

      await connection.execute(updateQuery, updateValues);
      await connection.commit();

      // Get updated data
      const [updatedLogbook] = await connection.execute(
        `SELECT 
          l.*,
          m.nama as mahasiswa_nama,
          m.nim,
          DATE_FORMAT(l.tanggal, '%Y-%m-%d') as tanggal,
          IF(l.paraf_admin IS NOT NULL, true, false) as is_signed
         FROM logbook l
         JOIN mahasiswa m ON l.mahasiswa_id = m.id
         WHERE l.id = ?`,
        [logbookId]
      );

      res.json({
        success: true,
        message: "Status logbook berhasil diupdate",
        data: updatedLogbook[0],
      });
    } catch (error) {
      await connection.rollback();
      console.error("Update logbook status error:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } finally {
      if (connection) {
        connection.release();
      }
    }
  },

  // Delete logbook
  deleteLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      const { logbookId } = req.params;
      const userId = req.user.mahasiswa_id || req.user.admin_id;

      // Verify ownership
      const [logbook] = await connection.execute(
        `SELECT * FROM logbook WHERE id = ? AND 
         (mahasiswa_id = ? OR admin_id = ?)`,
        [logbookId, userId, userId]
      );

      if (logbook.length === 0) {
        throw new Error("Logbook tidak ditemukan");
      }

      // Delete logbook
      await connection.execute("DELETE FROM logbook WHERE id = ?", [logbookId]);

      await connection.commit();

      res.json({
        success: true,
        message: "Logbook berhasil dihapus",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Delete logbook error:", error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    } finally {
      connection.release();
    }
  },

  // Get logbook detail
  getLogbookDetail: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { logbookId } = req.params;
      const userId = req.user.mahasiswa_id || req.user.admin_id;
      const userRole = req.user.role;

      // Debug logs
      console.log("Getting logbook detail:", {
        logbookId,
        userId,
        userRole,
      });

      let query = `
        SELECT 
          l.*,
          m.nama as mahasiswa_nama,
          m.nim,
          DATE_FORMAT(l.tanggal, '%Y-%m-%d') as tanggal,
          DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i:%s') as created_at,
          DATE_FORMAT(l.updated_at, '%Y-%m-%d %H:%i:%s') as updated_at
        FROM logbook l
        JOIN mahasiswa m ON l.mahasiswa_id = m.id
        WHERE l.id = ? AND `;

      const params = [logbookId];

      // Modify the WHERE clause based on role
      if (userRole === "mahasiswa") {
        query += "l.mahasiswa_id = ?";
        params.push(userId);
      } else if (userRole === "admin") {
        query += "l.admin_id = ?";
        params.push(userId);
      }

      console.log("Query:", query);
      console.log("Params:", params);

      const [logbook] = await connection.execute(query, params);

      if (logbook.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Logbook tidak ditemukan",
        });
      }

      res.json({
        success: true,
        data: logbook[0],
      });
    } catch (error) {
      console.error("Get logbook detail error:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil detail logbook",
      });
    } finally {
      connection.release();
    }
  },

  downloadLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      let userId = req.user.mahasiswa_id || req.user.admin_id;
      let userRole = req.user.role;
      let mahasiswaId = req.params.mahasiswaId;

      if (userRole === "mahasiswa") {
        mahasiswaId = userId;
      }

      // Get mahasiswa and admin info with JOIN
      let [userInfo] = await connection.execute(
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

      // Get logbooks data with formatted dates
      let [logbooks] = await connection.execute(
        `SELECT 
          l.*,
          DATE_FORMAT(l.tanggal, '%d/%m/%Y') as tanggal_formatted,
          TIME_FORMAT(l.created_at, '%H:%i') as waktu_formatted,
          CASE 
            WHEN l.status = 'pending' THEN 'Menunggu'
            WHEN l.status = 'approved' THEN 'Disetujui'
            WHEN l.status = 'rejected' THEN 'Ditolak'
          END as status_text
        FROM logbook l
        WHERE l.mahasiswa_id = ?
        ORDER BY l.tanggal ASC`,
        [mahasiswaId]
      );

      if (logbooks.length === 0) {
        throw new Error("Tidak ada data logbook");
      }

      // Create PDF
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        bufferPages: true,
      });

      // Handle document errors
      doc.on("error", (err) => {
        console.error("PDF generation error:", err);
        throw err;
      });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=logbook_${userInfo[0].nim}.pdf`
      );

      // Pipe the PDF document to the response
      const stream = doc.pipe(res);

      // Handle stream errors
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error generating PDF",
          });
        }
      });

      // Page header creation function
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
           .text('Laporan Aktifitas Magang', 160, 75, { align: 'center', width: 300 });
  
        doc.moveTo(60, 110)
           .lineTo(535, 110)
           .lineWidth(0.5)
           .strokeColor('#e0e0e0')
           .stroke();
      };
  
      createHeader();

      // Add metadata
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#444444")
        .text(`Nama: ${userInfo[0].mahasiswa_nama}`, 40, 120)
        .text(`NIM: ${userInfo[0].nim}`)
        .text(`Institusi: ${userInfo[0].institusi}`)
        .moveDown();

      // Table configuration
      const startX = 40;
      const colWidths = {
        no: 30,
        tanggal: 80,
        aktivitas: 220,
        progress: 70,
        status: 100,
      };

      // Initialize table position
      let yPos = doc.y;
      let xPos = startX;

      // Draw table headers with background
      doc.font("Helvetica-Bold");
      const headers = {
        No: colWidths.no,
        Tanggal: colWidths.tanggal,
        Aktivitas: colWidths.aktivitas,
        Progress: colWidths.progress,
        Status: colWidths.status,
      };

      // Calculate total width
      const totalWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);

      // Header background
      doc.fillColor("#f3f4f6").rect(xPos, yPos, totalWidth, 20).fill();

      // Header text
      doc.fillColor("#444444");
      Object.entries(headers).forEach(([title, width]) => {
        doc.text(title, xPos + 2, yPos + 5, {
          width: width - 4,
          align: "center",
        });
        xPos += width;
      });

      // Reset position for content
      yPos += 20;
      doc.font("Helvetica").fontSize(9);

      // Content with regular font and alternating backgrounds
      logbooks.forEach((log, index) => {
        const textHeight = doc.heightOfString(log.aktivitas, {
          width: colWidths.aktivitas - 10,
          align: "left",
        });
        const rowHeight = Math.max(textHeight, 20);

        // Check if new page is needed
        if (yPos + rowHeight > 700) {
          doc.addPage();
          createHeader();
          yPos = 150;
        }

        xPos = startX;

        // Alternate row backgrounds
        if (index % 2 === 0) {
          doc
            .fillColor("#fafafa")
            .rect(xPos, yPos, totalWidth, rowHeight)
            .fill();
        }

        doc.fillColor("#444444");

        // Draw cells
        doc.text((index + 1).toString(), xPos + 2, yPos + 5, {
          width: colWidths.no - 4,
          align: "center",
        });
        xPos += colWidths.no;

        doc.text(log.tanggal_formatted, xPos + 2, yPos + 5, {
          width: colWidths.tanggal - 4,
          align: "left",
        });
        xPos += colWidths.tanggal;

        doc.text(log.aktivitas, xPos + 2, yPos + 5, {
          width: colWidths.aktivitas - 4,
          align: "left",
        });
        xPos += colWidths.aktivitas;

        doc.text(`${log.progress}%`, xPos + 2, yPos + 5, {
          width: colWidths.progress - 4,
          align: "center",
        });
        xPos += colWidths.progress;

        const statusColors = {
          Disetujui: { bg: "#e8f5e9", text: "#1a8754" },
          Menunggu: { bg: "#fff3e0", text: "#fd7e14" },
          Ditolak: { bg: "#fee2e2", text: "#dc3545" },
        };

        const color = statusColors[log.status_text] || {
          bg: "#f3f4f6",
          text: "#444444",
        };
        doc
          .fillColor(color.bg)
          .roundedRect(
            xPos + 5,
            yPos + 2,
            colWidths.status - 10,
            rowHeight - 4,
            3
          )
          .fill()
          .fillColor(color.text)
          .text(log.status_text, xPos, yPos + 5, {
            width: colWidths.status,
            align: "center",
          });

        yPos += rowHeight;
      });

      // Add signature section
      yPos += 50;
      let signatureDate = new Date().toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
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

          console.log("Paraf image path from DB:", parafImagePath);
          const parafPath = path.join(process.cwd(), parafImagePath);
          console.log("Full paraf path:", parafPath);

          if (fs.existsSync(parafPath)) {
            doc.image(parafPath, 405, yPos, {
              fit: [100, 50],
              align: "center",
              valign: "center",
            });
            yPos += 50;
            console.log("Paraf added successfully");
          } else {
            console.log("Paraf file not found at:", parafPath);
            doc.text("(Paraf Digital)", 400, yPos);
            yPos += 30;
          }
        } catch (error) {
          console.error("Error adding paraf:", {
            error: error.message,
            parafImage: userInfo[0].paraf_image,
            parafImageType: typeof userInfo[0].paraf_image,
            isBuffer: Buffer.isBuffer(userInfo[0].paraf_image),
          });
          doc.text("(Paraf Digital)", 400, yPos);
          yPos += 30;
        }
      } else {
        console.log("No paraf_image found for admin:", userInfo[0].admin_nama);
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
          .fillColor("#444444")
          .text(
            `PT Semen Padang - Sistem Monitoring Magang | Halaman ${
              i + 1
            } dari ${range.count}`,
            40,
            doc.page.height - 35,
            { align: "center" }
          );
      }

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error("Error in downloadLogbook:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: error.message || "Terjadi kesalahan saat mengunduh logbook",
        });
      }
    } finally {
      connection.release();
    }
  },

  previewLogbook: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { logbookId } = req.params;
      const userId = req.user.mahasiswa_id || req.user.admin_id;
      const userRole = req.user.role;

      // Get mahasiswa info first (needed for both roles)
      let mahasiswaInfo;
      if (userRole === "mahasiswa") {
        const [info] = await connection.execute(
          `SELECT m.*, u.email 
           FROM mahasiswa m 
           JOIN users u ON m.user_id = u.id 
           WHERE m.id = ?`,
          [userId]
        );
        mahasiswaInfo = info[0];
      } else {
        const [info] = await connection.execute(
          `SELECT m.*, u.email 
           FROM mahasiswa m 
           JOIN users u ON m.user_id = u.id 
           WHERE m.admin_id = ?`,
          [userId]
        );
        mahasiswaInfo = info[0];
      }

      // Query to get all logbook entries with paraf
      const [logbooks] = await connection.execute(
        `SELECT 
          l.*,
          DATE_FORMAT(l.tanggal, '%d/%m/%Y') as tanggal_formatted,
          m.nama as mahasiswa_nama,
          m.nim,
          m.institusi,
          l.paraf_admin,
          l.status,
          a.paraf_image
         FROM logbook l
         JOIN mahasiswa m ON l.mahasiswa_id = m.id
         LEFT JOIN admin a ON l.admin_id = a.id
         WHERE ${
           userRole === "mahasiswa" ? "l.mahasiswa_id = ?" : "l.admin_id = ?"
         }
         ORDER BY l.tanggal ASC`,
        [userId]
      );

      if (logbooks.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Tidak ada data logbook",
        });
      }

      // Create PDF
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
      });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename=logbook_${mahasiswaInfo.nim}.pdf`
      );

      // Handle stream errors
      doc.on("error", (err) => {
        console.error("PDF generation error:", err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: "Error generating PDF",
          });
        }
      });

      // Pipe the PDF to the response
      doc.pipe(res);

      // Header
      doc
        .fontSize(16)
        .text("LOGBOOK AKTIVITAS MAGANG", { align: "center" })
        .moveDown();

      // Mahasiswa Info
      doc
        .fontSize(12)
        .text(`NIM: ${mahasiswaInfo.nim}`)
        .text(`Nama: ${mahasiswaInfo.nama}`)
        .text(`Institusi: ${mahasiswaInfo.institusi}`)
        .moveDown();

      // Table Header
      const startY = doc.y;
      const pageWidth = doc.page.width - 100;
      const columnWidths = {
        tanggal: pageWidth * 0.15,
        aktivitas: pageWidth * 0.45,
        progress: pageWidth * 0.15,
        status: pageWidth * 0.15,
        paraf: pageWidth * 0.1,
      };

      // Draw table header
      doc
        .fontSize(10)
        .text("Tanggal", 50, startY, { width: columnWidths.tanggal })
        .text("Aktivitas", 50 + columnWidths.tanggal, startY, {
          width: columnWidths.aktivitas,
        })
        .text(
          "Progress",
          50 + columnWidths.tanggal + columnWidths.aktivitas,
          startY,
          { width: columnWidths.progress }
        )
        .text(
          "Status",
          50 +
            columnWidths.tanggal +
            columnWidths.aktivitas +
            columnWidths.progress,
          startY,
          { width: columnWidths.status }
        )
        .text(
          "Paraf",
          50 +
            columnWidths.tanggal +
            columnWidths.aktivitas +
            columnWidths.progress +
            columnWidths.status,
          startY,
          { width: columnWidths.paraf }
        );

      doc
        .moveTo(50, startY + 15)
        .lineTo(pageWidth + 50, startY + 15)
        .stroke();

      // Table Content
      let currentY = startY + 20;

      for (const entry of logbooks) {
        // Check if we need a new page
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }

        const activityHeight = Math.max(
          doc.heightOfString(entry.aktivitas, {
            width: columnWidths.aktivitas,
          }),
          40 // Minimum height for paraf image
        );

        // Draw text content
        doc
          .text(entry.tanggal_formatted, 50, currentY, {
            width: columnWidths.tanggal,
          })
          .text(entry.aktivitas, 50 + columnWidths.tanggal, currentY, {
            width: columnWidths.aktivitas,
          })
          .text(
            `${entry.progress}%`,
            50 + columnWidths.tanggal + columnWidths.aktivitas,
            currentY,
            { width: columnWidths.progress }
          )
          .text(
            entry.status.toUpperCase(),
            50 +
              columnWidths.tanggal +
              columnWidths.aktivitas +
              columnWidths.progress,
            currentY,
            { width: columnWidths.status }
          );

        // Add paraf if entry is approved and paraf_image exists
        const parafX =
          50 +
          columnWidths.tanggal +
          columnWidths.aktivitas +
          columnWidths.progress +
          columnWidths.status;

        if (entry.status === "approved" && entry.paraf_admin) {
          doc.text("(Diparaf)", parafX, currentY, {
            width: columnWidths.paraf,
          });
          if (entry.paraf_image && fs.existsSync(entry.paraf_image)) {
            try {
              doc.image(entry.paraf_image, parafX, currentY + 5, {
                fit: [columnWidths.paraf - 5, 30],
                align: "center",
                valign: "center",
              });
            } catch (err) {
              console.error("Error adding paraf to PDF:", err);
              doc.text("(Paraf)", parafX, currentY + 5, {
                width: columnWidths.paraf,
              });
            }
          }
        }

        if (entry.catatan_admin) {
          currentY += activityHeight + 5;
          doc
            .fontSize(9)
            .text(`Catatan: ${entry.catatan_admin}`, 70, currentY, {
              width: pageWidth - 20,
              color: "gray",
            });
        }

        currentY += activityHeight + 10;
      }

      // Footer
      doc
        .fontSize(10)
        .text(
          `Dicetak pada: ${new Date().toLocaleString("id-ID")}`,
          50,
          doc.page.height - 50,
          {
            align: "center",
          }
        );

      // Finalize PDF
      doc.end();
    } catch (error) {
      console.error("Preview logbook error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Terjadi kesalahan saat membuat preview logbook",
        });
      }
    } finally {
      connection.release();
    }
  },

  // Add to logbookController.js

  getLogbookStatusStats: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const adminId = req.user.id;

      const query = `
        SELECT 
          l.status,
          COUNT(*) as count,
          COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() as percentage
        FROM logbook l
        JOIN mahasiswa m ON l.mahasiswa_id = m.id
        WHERE m.admin_id = ?
        GROUP BY l.status
      `;

      const [stats] = await connection.execute(query, [adminId]);

      const defaultStats = {
        pending: 0,
        approved: 0,
        rejected: 0,
      };

      stats.forEach((stat) => {
        defaultStats[stat.status] = stat.percentage;
      });

      res.json({
        success: true,
        data: defaultStats,
      });
    } catch (error) {
      console.error("Error getting logbook stats:", error);
      res.status(500).json({
        success: false,
        message: "Terjadi kesalahan saat mengambil statistik logbook",
      });
    } finally {
      connection.release();
    }
  },
};

module.exports = logbookController;
