import multer from "multer";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Campaign file upload config — accepts CSV, XLSX, XLS only
 * Files stored temporarily on disk, then uploaded to Cloudinary in the controller
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmpDir = os.tmpdir();
    const uploadDir = path.join(tmpDir, "campaign-uploads");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${uniqueSuffix}-${name}${ext}`);
  },
});

const ALLOWED_MIMES = [
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
  "application/vnd.ms-excel", // .xls and sometimes .csv on Windows
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
];

const fileFilter = (req, file, cb) => {
  // Also accept by extension since MIME detection can be unreliable
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.includes(file.mimetype) || [".csv", ".xlsx", ".xls"].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only CSV, XLSX, and XLS files are allowed."), false);
  }
};

export const campaignUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 1,
  },
});
