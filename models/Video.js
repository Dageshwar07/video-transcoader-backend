import mongoose from 'mongoose'

const VideoSchema = new mongoose.Schema({
    videoId: { type: String, required: true, unique: true },
    videoUrls: { type: Object, required: true },
    thumbnailUrl: { type: String, required: true }, // Ensure this is included
    createdAt: { type: Date, default: Date.now }
})

const Video = mongoose.model('Video', VideoSchema)

export default Video
