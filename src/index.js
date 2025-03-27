import express from "express";
import cors from "cors";
import fs from "fs";
import { exec } from "child_process";
import path from "path";
import mongoose from "mongoose";
import { uploader } from "./middlewares/uploader.js";
import Video from "../models/Video.js";

const port = process.env.PORT || 2000;
const app = express();

// Ensure required directories exist
const requiredDirs = ["./uploads", "./hls-output", "./thumbnails"];
requiredDirs.forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use("/hls-output", express.static(path.join(process.cwd(), "hls-output")));
app.use("/thumbnails", express.static(path.join(process.cwd(), "thumbnails")));

// Check if FFmpeg is installed
exec("ffmpeg -version", (err) => {
    if (err) {
        console.error("❌ FFmpeg is not installed. Please install it before running the server.");
        process.exit(1);
    } else {
        console.log("✅ FFmpeg is installed.");
    }
});

// MongoDB Connection
const mongoURI = "mongodb://127.0.0.1:27017/videoDB";
mongoose
    .connect(mongoURI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Upload Route
app.post("/api/upload", uploader("video"), async (req, res) => {
    if (!req.file || !req.videoId) {
        console.error("❌ Video file or videoId missing!", req.file, req.videoId);
        return res.status(400).json({ error: "Video upload failed!" });
    }

    const videoId = req.videoId;
    const uploadedVideoPath = req.file.path;
    const outputFolderRootPath = `./hls-output/${videoId}`;

    const resolutions = {
        "144p": { height: 144, bitrate: "400k", audio: "64k" },
        "360p": { height: 360, bitrate: "800k", audio: "96k" },
        "480p": { height: 480, bitrate: "1400k", audio: "128k" },
        "720p": { height: 720, bitrate: "2800k", audio: "128k" },
        "1080p": { height: 1080, bitrate: "5000k", audio: "192k" },
    };

    // Ensure resolution directories exist
    Object.keys(resolutions).forEach((res) => {
        const resPath = `${outputFolderRootPath}/${res}`;
        if (!fs.existsSync(resPath)) fs.mkdirSync(resPath, { recursive: true });
    });

    const thumbnailUrl = req.file.thumbnail; // Thumbnail URL from uploader middleware

    // HLS Conversion Function
    const executeHLSConversion = (resolution, config) => {
        return new Promise((resolve, reject) => {
            const outputPath = `${outputFolderRootPath}/${resolution}`;
            const command = `ffmpeg -i ${uploadedVideoPath} -vf "scale=-2:${config.height}" -c:v libx264 -preset fast -b:v ${config.bitrate} -c:a aac -b:a ${config.audio} -f hls -hls_time 10 -hls_playlist_type vod -hls_segment_filename "${outputPath}/segment%03d.ts" -start_number 0 "${outputPath}/index.m3u8"`;

            exec(command, (error) => {
                if (error) {
                    console.error(`❌ HLS Conversion failed for ${resolution}:`, error);
                    reject(error);
                } else {
                    console.log(`✅ HLS Conversion successful for ${resolution}`);

                    // Ensure HLS playlist exists
                    if (!fs.existsSync(`${outputPath}/index.m3u8`)) {
                        console.error(`❌ HLS file missing: ${outputPath}/index.m3u8`);
                        reject(new Error(`HLS file missing for ${resolution}`));
                    } else {
                        resolve();
                    }
                }
            });
        });
    };

    try {
        const conversionResults = await Promise.allSettled(
            Object.entries(resolutions).map(([res, config]) =>
                executeHLSConversion(res, config)
            )
        );

        const successfulResolutions = {};
        const failedResolutions = [];

        Object.entries(resolutions).forEach(([res], index) => {
            if (conversionResults[index].status === "fulfilled") {
                successfulResolutions[res] = `http://localhost:${port}/hls-output/${videoId}/${res}/index.m3u8`;
            } else {
                failedResolutions.push(res);
            }
        });

        if (failedResolutions.length === Object.keys(resolutions).length) {
            throw new Error("All HLS resolutions failed!");
        }

        // Save to MongoDB
        const newVideo = new Video({ videoId, videoUrls: successfulResolutions, thumbnailUrl });
        await newVideo.save();
        console.log("✅ Video saved to MongoDB:", newVideo);

        return res.status(200).json({ videoId, videoUrls: successfulResolutions, thumbnailUrl });
    } catch (error) {
        console.error("❌ HLS Conversion failed:", error);

        // Cleanup on failure
        try {
            if (fs.existsSync(uploadedVideoPath)) {
                console.log("🟡 Deleting uploaded file due to failure:", uploadedVideoPath);
                fs.unlinkSync(uploadedVideoPath);
            }

            if (fs.existsSync(outputFolderRootPath)) {
                console.log("🟡 Deleting HLS output folder due to failure:", outputFolderRootPath);
                fs.rmdirSync(outputFolderRootPath, { recursive: true });
            }
        } catch (cleanupError) {
            console.error("❌ Cleanup failed:", cleanupError);
        }

        return res.status(500).send("HLS conversion failed!");
    }
});

// Fetch videos
app.get("/api/videos", async (req, res) => {
    try {
        const videos = await Video.find();
        return res.status(200).json(videos);
    } catch (err) {
        console.error("❌ Error fetching videos:", err);
        return res.status(500).send("Error fetching videos!");
    }
});
// Fetch a single video by ID
app.get("/api/videos/:videoId", async (req, res) => {
    try {
        const { videoId } = req.params;
        const video = await Video.findOne({ videoId });

        if (!video) {
            return res.status(404).json({ error: "Video not found!" });
        }

        return res.status(200).json(video);
    } catch (err) {
        console.error("❌ Error fetching video:", err);
        return res.status(500).send("Error fetching video!");
    }
});


app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});
