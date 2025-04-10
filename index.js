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
const UserChat = require("./models/UserChat")

const app = express()
app.use(express.json())
app.use(
  cors({
    origin: ["https://chat-client-j2yj.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
    allowedHeaders: "Content-Type,Authorization",
  }),
)
// app.use(cors())
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

app.use("/api", authRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/userlistwithchat", userChatRoutes)
app.use("/api", uploadRoutes)

app.delete("/chat", async (req, res) => {
  const { currentUserId, chatWithId } = req.body;

  try {
    const userChat = await UserChat.findOne({ currentUserId });
   console.log(userChat)
    if (!userChat) {
      return res.status(404).json({ message: "User not found." });
    }

    const originalLength = userChat.chats.length;
    userChat.chats = userChat.chats.filter(chat => chat.chatWithId !== chatWithId);

    if (userChat.chats.length === originalLength) {
      return res.status(404).json({ message: "Chat not found." });
    }

    await userChat.save();
    res.status(200).json({ message: "Chat deleted successfully.", chats: userChat.chats });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ message: "Server error." });
  }
});
// Add a route to get a user's last seen time
app.get("/api/user/last-seen/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.json({ lastSeen: user.lastSeen })
  } catch (err) {
    console.error("Error fetching last seen:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// Add a route to update a user's last seen time
app.post("/api/user/update-last-seen/:userId", async (req, res) => {
  try {
    const timestamp = req.body.timestamp || new Date()
    await User.findByIdAndUpdate(req.params.userId, { lastSeen: timestamp })

    // Broadcast to all connected users
    io.emit("user last seen", { userId: req.params.userId, timestamp })

    res.json({ success: true })
  } catch (err) {
    console.error("Error updating last seen:", err)
    res.status(500).json({ message: "Server error" })
  }
})

// Add a new route to delete a single message
app.delete("/api/messages/batch", async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ message: "Invalid message IDs" });
    }

    await Message.deleteMany({ _id: { $in: messageIds } });

    io.emit("messages batch deleted", { messageIds });

    res.json({ success: true, message: "Messages deleted successfully" });
  } catch (err) {
    console.error("Error deleting messages:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.delete("/api/messages/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    await Message.findByIdAndDelete(messageId);

    io.emit("message deleted", { messageId });

    res.json({ success: true, message: "Message deleted successfully" });
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/", (req, res) => {
  res.send("Welcome to the Webhook Servers!")
})
const server = createServer(app)
const io = new Server(server, {
  cors: { origin: "https://chat-client-j2yj.vercel.app", methods: ["GET", "POST"] },
})

const users = {}
const lastSeenTimes = {}

const broadcastOnlineUsers = () => {
  const onlineUserIds = Object.keys(users)
  io.emit("users online", onlineUserIds)
}

const updateLastSeen = async (userId) => {
  try {
    const timestamp = new Date()
    lastSeenTimes[userId] = timestamp

    await User.findByIdAndUpdate(userId, { lastSeen: timestamp })

    io.emit("user last seen", { userId, timestamp })

    return timestamp
  } catch (err) {
    console.error("Error updating last seen:", err)
    return null
  }
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id)

  socket.on("ping", () => {
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
  socket.on("register", async (userId) => {
    users[userId] = socket.id // Map userId to socketId
    console.log(`User ${userId} connected with socket ${socket.id}`)

    // Update user's last seen time to show they're online
    try {
      const timestamp = new Date()
      lastSeenTimes[userId] = timestamp
      await User.findByIdAndUpdate(userId, { lastSeen: timestamp })
    } catch (err) {
      console.error("Error updating last seen on register:", err)
    }

    broadcastOnlineUsers()

    socket.emit("last seen times", lastSeenTimes)
  })
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

  socket.on("mark messages seen", async ({ userId, chatWithId }) => {
    try {
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

  // Add socket event handler for message deletion in the io.on("connection") block
  socket.on("delete message", async ({ messageId, senderId }) => {
    try {
      const message = await Message.findById(messageId)

      if (!message) {
        return
      }

      // Check if the sender is the one who's deleting the message
      if (message.sender.toString() === senderId) {
        await Message.findByIdAndDelete(messageId)

        // Broadcast to all connected users
        io.emit("message deleted", { messageId })
      }
    } catch (err) {
      console.error("Error deleting message via socket:", err)
    }
  })

  // Add socket event handler for batch message deletion
  socket.on("delete messages batch", async ({ messageIds, senderId }) => {
    try {
      // Find messages that belong to the sender
      const messages = await Message.find({
        _id: { $in: messageIds },
        sender: senderId,
      })

      if (messages.length === 0) {
        return
      }

      const validMessageIds = messages.map((msg) => msg._id)

      await Message.deleteMany({ _id: { $in: validMessageIds } })

      // Broadcast to all connected users
      io.emit("messages batch deleted", { messageIds: validMessageIds })
    } catch (err) {
      console.error("Error batch deleting messages via socket:", err)
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

// Periodically update last seen for online users to keep it fresh
setInterval(
  async () => {
    for (const userId in users) {
      try {
        const timestamp = new Date()
        lastSeenTimes[userId] = timestamp
        await User.findByIdAndUpdate(userId, { lastSeen: timestamp })
      } catch (err) {
        console.error(`Error updating periodic last seen for user ${userId}:`, err)
      }
    }
  },
  5 * 60 * 1000,
) // Every 5 minutes

mongoose.connect(process.env.MONGO_URI).then(() => {
  console.log("Connected to MongoDB")
  server.listen(8000, () => console.log("Server running at http://localhost:8000"))
})
