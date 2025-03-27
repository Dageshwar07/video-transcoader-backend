import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

const generateThumbnail = (videoPath, thumbnailPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(videoPath)
            .screenshots({
                timestamps: ["2"], // Capture at 2 seconds
                filename: path.basename(thumbnailPath),
                folder: path.dirname(thumbnailPath),
                size: "320x180", // Resize to 320x180 pixels
            })
            .on("end", () => {
                console.log("✅ Thumbnail generated:", thumbnailPath);
                resolve(thumbnailPath);
            })
            .on("error", (err) => {
                console.error("❌ Thumbnail generation failed:", err);
                reject(err);
            });
    });
};

export default generateThumbnail;
