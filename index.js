require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const { createServer } = require("http")
const { Server } = require("socket.io")
const path = require("path")
const User = require("./models/User")
const Message = require("./models/Message")
const authRoutes = require("./routes/auth")
const messageRoutes = require("./routes/messages")
const userChatRoutes = require("./routes/userChat")
const uploadRoutes = require("./routes/uploads")

const app = express()
app.use(express.json())
app.use(cors({
  origin: ["https://chat-client-j2yj.vercel.app"],
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true,
  allowedHeaders: 'Content-Type,Authorization'
}));
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

app.use("/api", authRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/userlistwithchat", userChatRoutes)
app.use("/api", uploadRoutes)
app.get("/", (req, res) => {
  res.send("Welcome to the Webhook Servers!");
})
const server = createServer(app)
const io = new Server(server, {
  cors: { origin: "https://chat-client-j2yj.vercel.app", methods: ["GET", "POST"] },
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

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("Connected to MongoDB")
  server.listen(8000, () => console.log("Server running at http://localhost:8000"))
})
