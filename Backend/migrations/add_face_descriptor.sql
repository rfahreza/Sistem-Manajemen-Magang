-- Migration: Add face_descriptor column to mahasiswa table
-- Date: 2026-06-24
-- Description: Add face descriptor column for @vladmandic/face-api face recognition
-- Note: qr_code column is kept (not removed) for backward compatibility

ALTER TABLE mahasiswa
  ADD COLUMN IF NOT EXISTS face_descriptor JSON DEFAULT NULL
  COMMENT 'Averaged 128-float face descriptor from @vladmandic/face-api';
