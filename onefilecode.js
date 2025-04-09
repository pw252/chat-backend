require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const { createServer } = require("node:http")
const { Server } = require("socket.io")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const cors = require("cors")
const multer = require("multer")
const path = require("path")
const fs = require("fs")

const app = express()
app.use(express.json())
app.use(cors())
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
})

const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (
      !file.mimetype.startsWith("image/") &&
      !file.mimetype.startsWith("audio/") &&
      !file.mimetype.match(
        /application\/(pdf|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)/,
      ) &&
      !file.mimetype.match(/text\/(plain|csv)/)
    ) {
      return cb(new Error("Only image, audio, and document files (PDF, Word, Excel, text) are allowed!"), false)
    }
    cb(null, true)
  },
})

app.use("/uploads", express.static(path.join(__dirname, "uploads")))


mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.log("Error connecting to MongoDB:", err))


const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  lastSeen: { type: Date, default: Date.now },
})

const User = mongoose.model("User", userSchema)

// Update the Message Schema to include document support
const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String },
  imageUrls: { type: [String] },
  audioUrls: { type: [String] },
  documentUrls: { type: [String] }, // Add documentUrls field
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false },
  seenAt: { type: Date },
})

const Message = mongoose.model("Message", messageSchema)

const userChatSchema = new mongoose.Schema({
  currentUserId: { type: String },
  chats: [
    {
      chatWithId: { type: String },
      username: { type: String },
    },
  ],
})

const Userlistwihchat = mongoose.model("UserChat", userChatSchema)

// File upload endpoint
app.post("/api/upload", upload.array("images", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded files
    const imageUrls = req.files.map((file) => `http://localhost:8000/uploads/${file.filename}`)
    res.status(200).json({ imageUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

// Add a new endpoint for audio uploads
app.post("/api/upload-audio", upload.array("audio", 3), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded audio files
    const audioUrls = req.files.map((file) => `http://localhost:8000/uploads/${file.filename}`)
    res.status(200).json({ audioUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

// Add a new endpoint for document uploads after the audio upload endpoint
app.post("/api/upload-document", upload.array("documents", 5), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" })
    }

    // Return the URLs to the uploaded document files
    const documentUrls = req.files.map((file) => `http://localhost:8000/uploads/${file.filename}`)
    res.status(200).json({ documentUrls })
  } catch (error) {
    console.error("Upload error:", error)
    res.status(500).json({ message: "Error uploading files" })
  }
})

app.post("/api/userlistwithchat", async (req, res) => {
  try {
    const { currentUserId, chats } = req.body

    // Find existing chat document for the user
    const existingChat = await Userlistwihchat.findOne({ currentUserId })

    if (existingChat) {
      // Filter out duplicates before adding
      const existingIds = existingChat.chats.map((c) => c.chatWithId)

      const newChats = chats.filter((chat) => !existingIds.includes(chat.chatWithId))

      if (newChats.length > 0) {
        existingChat.chats.push(...newChats)
        await existingChat.save()
        return res.status(200).json({ message: "Chats updated", data: existingChat })
      } else {
        return res.status(200).json({ message: "No new chats to add", data: existingChat })
      }
    } else {
      // Create new chat document
      const newChat = new Userlistwihchat({ currentUserId, chats })
      await newChat.save()
      return res.status(201).json({ message: "Chat created", data: newChat })
    }
  } catch (err) {
    console.error("Chat save error:", err)
    res.status(500).json({ message: "Server error" })
  }
})

app.get("/api/userlistwithchat/:currentUserId", async (req, res) => {
  try {
    const { currentUserId } = req.params

    const chatData = await Userlistwihchat.findOne({ currentUserId })

    if (chatData) {
      res.status(200).json(chatData.chats) // only return chats array
    } else {
      res.status(404).json({ message: "No chats found for this user" })
    }
  } catch (err) {
    console.error("Error fetching chats:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// Middleware to authenticate user via JWT
const authenticateJWT = (req, res, next) => {
  const token = req.header("Authorization")
  if (!token) return res.sendStatus(403)

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403)
    req.user = user
    next()
  })
}

// User Registration
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = new User({ username, password: hashedPassword })
  await user.save()

  res.status(201).send("User registered successfully")
})

// User Login
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body

  const user = await User.findOne({ username })
  if (!user) return res.status(400).send("User not found")

  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) return res.status(400).send("Invalid credentials")

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" })
  res.json({ token, user: { id: user._id, username: user.username } })
})

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find() // Assuming you're using MongoDB
    res.status(200).json(users) // Return all users
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" })
  }
})

// Fetch Messages between two users
app.get("/api/messages", async (req, res) => {
  const { userId, chatWithId } = req.query
  const messages = await Message.find({
    $or: [
      { sender: userId, receiver: chatWithId },
      { sender: chatWithId, receiver: userId },
    ],
  }).populate("sender receiver", "username")
  res.json(messages)
})

// Add a new endpoint to mark messages as seen
app.post("/api/messages/seen", async (req, res) => {
  try {
    const { userId, chatWithId } = req.body

    // Update all messages from chatWithId to userId as seen
    const result = await Message.updateMany(
      {
        sender: chatWithId,
        receiver: userId,
        seen: false,
      },
      {
        $set: {
          seen: true,
          seenAt: new Date(),
        },
      },
    )

    // Emit socket event to notify the sender their messages were seen
    const senderSocketId = users[chatWithId]
    if (senderSocketId) {
      io.to(senderSocketId).emit("messages seen", {
        by: userId,
        at: new Date().toISOString(),
      })
    }

    res.status(200).json({ updated: result.modifiedCount })
  } catch (err) {
    console.error("Error marking messages as seen:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// Handle socket.io connections
const users = {} // To store userId -> socketId mapping
const lastSeenTimes = {} // To store userId -> lastSeen timestamp

// Broadcast online users whenever a user connects or disconnects
const broadcastOnlineUsers = () => {
  const onlineUserIds = Object.keys(users)
  io.emit("users online", onlineUserIds)
}

// Update last seen time for a user
const updateLastSeen = async (userId) => {
  try {
    const timestamp = new Date()
    lastSeenTimes[userId] = timestamp

    // Update in database
    await User.findByIdAndUpdate(userId, { lastSeen: timestamp })

    // Broadcast to all connected users
    io.emit("user last seen", { userId, timestamp })
  } catch (err) {
    console.error("Error updating last seen:", err)
  }
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id)

  socket.on("ping", () => {
    // Just respond to keep the connection alive
    socket.emit("pong")
  })
  // Typing indicator
  socket.on("typing", ({ senderId, receiverId }) => {
    const receiverSocketId = users[receiverId]
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing", { senderId })
    }
  })

  socket.on("stop typing", ({ senderId, receiverId }) => {
    const receiverSocketId = users[receiverId]
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("stop typing", { senderId })
    }
  })

  // Listen for user identification
  socket.on("register", (userId) => {
    users[userId] = socket.id // Map userId to socketId
    console.log(`User ${userId} connected with socket ${socket.id}`)

    // Broadcast updated online users list
    broadcastOnlineUsers()

    // Send last seen times to the newly connected user
    socket.emit("last seen times", lastSeenTimes)
  })
  // Update the socket.on("chat message") handler to include document support
  socket.on("chat message", async (data) => {
    const { senderId, receiverId, message, username, imageUrls, audioUrls, documentUrls } = data

    try {
      // Save the message in the database
      const newMessage = new Message({
        sender: senderId,
        receiver: receiverId,
        content: message,
        imageUrls: imageUrls,
        audioUrls: audioUrls,
        documentUrls: documentUrls, // Add documentUrls
        timestamp: new Date(),
      })

      const savedMessage = await newMessage.save()

      // Prepare the message object to send to clients
      const messageToSend = {
        _id: savedMessage._id,
        sender: { _id: senderId, username },
        receiver: { _id: receiverId },
        content: message,
        imageUrls: imageUrls,
        audioUrls: audioUrls,
        documentUrls: documentUrls, // Add documentUrls
        timestamp: savedMessage.timestamp,
        seen: false,
      }

      // Emit to the specific receiver if they are connected
      const receiverSocketId = users[receiverId]
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("chat message", messageToSend)
      }

      // Send message to the sender as well
      const senderSocketId = users[senderId]
      if (senderSocketId) {
        io.to(senderSocketId).emit("chat message", messageToSend)
      }
    } catch (err) {
      console.error("Error saving or sending message:", err)
    }
  })

  // Add socket event handler for seen messages in the io.on("connection") block
  socket.on("mark messages seen", async ({ userId, chatWithId }) => {
    try {
      // Update all messages from chatWithId to userId as seen
      const result = await Message.updateMany(
        {
          sender: chatWithId,
          receiver: userId,
          seen: false,
        },
        {
          $set: {
            seen: true,
            seenAt: new Date(),
          },
        },
      )

      // Emit socket event to notify the sender their messages were seen
      const senderSocketId = users[chatWithId]
      if (senderSocketId) {
        io.to(senderSocketId).emit("messages seen", {
          by: userId,
          at: new Date().toISOString(),
        })
      }
    } catch (err) {
      console.error("Error marking messages as seen via socket:", err)
    }
  })

  socket.on("disconnectsingleuser", (userId) => {
    const socketId = users[userId]
    if (socketId) {
      const userSocket = io.sockets.sockets.get(socketId)
      if (userSocket) {
        console.log(`Forcefully disconnected user: ${userId}`)
  
        // Update last seen time
        updateLastSeen(userId)
  
        // Remove from online users list
        delete users[userId]
  
        // Broadcast updated online users list
        broadcastOnlineUsers()
      }
    }
  })
  
  // Handle user disconnect
  socket.on("disconnect", () => {
    // Find user by socketId and remove them
    for (const userId in users) {
      if (users[userId] === socket.id) {
        console.log(`User ${userId} disconnected`)

        // Update last seen time when user disconnects
        updateLastSeen(userId)

        delete users[userId]

        // Broadcast updated online users list
        broadcastOnlineUsers()
        break
      }
    }
  })
})

server.listen(8000, () => {
  console.log("Server running at http://localhost:8000")
})
