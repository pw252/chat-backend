const mongoose = require("mongoose")

const userChatSchema = new mongoose.Schema({
  currentUserId: String,
  chats: [
    {
      chatWithId: String,
      username: String,
    },
  ],
})

module.exports = mongoose.model("UserChat", userChatSchema)
