import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import generateThumbnail from "../generateThumbnail.js";

const PORT = process.env.PORT || 2000;
const BASE_URL = `http://localhost:${PORT}`; // Dynamic backend URL

// Ensure necessary directories exist
const ensureDirExists = (dir) => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

// Initialize required folders
const UPLOADS_DIR = "./uploads/";
const THUMBNAILS_DIR = "./thumbnails/";
ensureDirExists(UPLOADS_DIR);
ensureDirExists(THUMBNAILS_DIR);

// Multer Configuration
const multerConfig = () => {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, UPLOADS_DIR);
        },
        filename: (req, file, cb) => {
            const fileExtension = path.extname(file.originalname); // Get file extension
            const videoId = uuid(); // ✅ Use UUID for consistency
            req.videoId = videoId; // ✅ Store videoId in request object
            cb(null, `${videoId}${fileExtension}`); // Set filename as videoId.extension
        },
    });

    return multer({
        storage,
        fileFilter: (req, file, cb) => {
            const allowedMimeTypes = ["video/mp4", "video/mkv", "video/webm"];
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return cb(new Error("Only MP4, MKV, and WEBM videos are allowed"), false);
            }
            cb(null, true);
        },
        limits: { fileSize: 500 * 1024 * 1024 }, // Limit file size (500MB)
    });
};

// Upload Middleware with Thumbnail Generation
export const uploader = (fieldName) => {
    return async (req, res, next) => {
        try {
            const upload = multerConfig();
            await new Promise((resolve, reject) => {
                upload.single(fieldName)(req, res, (error) => {
                    if (error) {
                        console.error("❌ Multer upload error:", error);
                        return reject(error);
                    }
                    resolve();
                });
            });

            if (!req.file || !req.file.path) {
                console.error("❌ No file uploaded!");
                return res.status(400).json({ error: "No file uploaded!" });
            }

            const videoPath = req.file.path;
            const videoId = req.videoId;
            const thumbnailFilename = `${videoId}.jpg`;
            const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename);

            console.log("🟢 Generating thumbnail for:", videoPath);

            // Generate Thumbnail
            await generateThumbnail(videoPath, thumbnailPath);

            if (!fs.existsSync(thumbnailPath)) {
                console.error("❌ Thumbnail not created:", thumbnailPath);
                return res.status(500).json({ error: "Failed to generate thumbnail!" });
            }

            // Save absolute thumbnail URL
            req.file.thumbnail = `${BASE_URL}/thumbnails/${thumbnailFilename}`;
            req.file.videoId = videoId;

            console.log("✅ Thumbnail generated:", req.file.thumbnail);

            next();
        } catch (error) {
            console.error("❌ Thumbnail processing failed:", error);
            return res.status(500).json({ error: "Thumbnail processing failed!" });
        }
    };
};
