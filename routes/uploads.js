const express = require("express")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const router = express.Router()

const uploadsDir = path.join(__dirname, "..", "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      !file.mimetype.startsWith("image/") &&
      !file.mimetype.startsWith("audio/") &&
      !file.mimetype.match(/application\/(pdf|msword|vnd\.openxmlformats|vnd\.ms-excel)/) &&
      !file.mimetype.match(/text\/(plain|csv)/)
    ) {
      return cb(new Error("Unsupported file type"), false)
    }
    cb(null, true)
  },
})

router.post("/upload", upload.array("images", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded files
    const imageUrls = req.files.map((file) => `https://chat-client-j2yj.vercel.app/uploads/${file.filename}`)
    res.status(200).json({ imageUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

router.post("/upload-audio", upload.array("audio", 3), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded audio files
    const audioUrls = req.files.map((file) => `https://chat-client-j2yj.vercel.app/uploads/${file.filename}`)
    res.status(200).json({ audioUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

router.post("/upload-document", upload.array("documents", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded document files
    const documentUrls = req.files.map((file) => `https://chat-client-j2yj.vercel.app/uploads/${file.filename}`)
    res.status(200).json({ documentUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

module.exports = router
