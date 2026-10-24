require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../config/database');
const fs = require('fs');
const path = require('path');

async function migrate() {
  console.log('Connecting to database...');
  const connection = await db.getConnection();
  try {
    console.log('Checking columns in table `mahasiswa`...');
    const [mahasiswaCols] = await connection.execute("SHOW COLUMNS FROM mahasiswa LIKE 'face_descriptor'");
    if (mahasiswaCols.length === 0) {
      console.log('Adding column `face_descriptor` to table `mahasiswa`...');
      await connection.execute("ALTER TABLE mahasiswa ADD COLUMN face_descriptor LONGTEXT NULL AFTER qr_code");
      console.log('Column `face_descriptor` added.');
    } else {
      console.log('Column `face_descriptor` already exists in table `mahasiswa`.');
    }

    console.log('Checking columns in table `absensi`...');
    const [absensiCols] = await connection.execute("SHOW COLUMNS FROM absensi LIKE 'face_photo'");
    if (absensiCols.length === 0) {
      console.log('Adding column `face_photo` to table `absensi`...');
      await connection.execute("ALTER TABLE absensi ADD COLUMN face_photo VARCHAR(255) NULL AFTER device_info");
      console.log('Column `face_photo` added.');
    } else {
      console.log('Column `face_photo` already exists in table `absensi`.');
    }

    // Ensure uploads/absensi directory exists
    const absensiUploadDir = path.join(__dirname, '../uploads/absensi');
    if (!fs.existsSync(absensiUploadDir)) {
      fs.mkdirSync(absensiUploadDir, { recursive: true });
      console.log('Created directory: uploads/absensi');
    }

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

migrate();
