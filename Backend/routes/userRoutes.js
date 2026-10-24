const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const validation = require('../middleware/validation');
const uploadMiddleware = require('../middleware/upload'); // Ensure this import is correct

// Ensure upload directory exists
const uploadDir = 'uploads/profiles';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Configure multer upload
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function(req, file, cb) {
    // Accept images only
    if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG)$/)) {
      req.fileValidationError = 'Only image files are allowed!';
      return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
  }
});

// Error handling middleware for file upload
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File terlalu besar. Maksimal 5MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: 'Error pada upload file'
    });
  }
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Terjadi kesalahan saat upload file'
    });
  }
  
  next();
};

// Protect all routes with token verification
router.use(auth.verifyToken);

router.get('/profileQr', userController.getMahasiswaProfile);
router.get('/qrcode', userController.getQRCode);

// Profile routes
// Face Recognition registration
router.post('/face-register', auth.isMahasiswa, userController.registerFace);
router.delete('/face', auth.isMahasiswa, userController.deleteFace);

router.get('/profile', (req, res, next) => {
  console.log('GET /profile - User:', req.user);
  next();
}, userController.getProfile);

router.put('/profile',
  (req, res, next) => {
    console.log('PUT /profile - User:', req.user);
    next();
  },
  auth.isMahasiswa,  // Verify mahasiswa role
  upload.single('photo_profile'),
  handleUploadError,
  uploadMiddleware.deleteOldFile,  // Ensure this middleware is used correctly
  validation.validateUpdateProfile,
  validation.handleValidationErrors,
  userController.updateProfile
);

// Password update
router.put('/password',
  (req, res, next) => {
    console.log('PUT /password - User:', req.user);
    next();
  },
  auth.isMahasiswa,  // Verify mahasiswa role
  validation.validatePassword,
  validation.handleValidationErrors,
  userController.updatePassword
);

// Update password
router.put('/profile/password', auth.verifyToken, userController.updatePassword);


// Dashboard
router.get('/dashboard/summary', 
  auth.isMahasiswa,
  userController.getDashboardSummary
);

// Get recent activities
router.get('/recent-activities', auth.verifyToken, userController.getRecentActivities);

// Get status magang
router.get('/status-magang', auth.verifyToken, userController.getStatusMagang);

module.exports = router;