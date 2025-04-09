const express = require("express")
const UserChat = require("../models/UserChat")

const router = express.Router()

router.post("/", async (req, res) => {
  const { currentUserId, chats } = req.body
  const existingChat = await UserChat.findOne({ currentUserId })

  if (existingChat) {
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
    const newChat = new UserChat({ currentUserId, chats })
    await newChat.save()
    return res.status(201).json({ message: "Chat created", data: newChat })
  }
})

router.get("/:currentUserId", async (req, res) => {
  const chatData = await UserChat.findOne({ currentUserId: req.params.currentUserId })
  if (chatData) {
    res.status(200).json(chatData.chats)
  } else {
    res.status(404).json({ message: "No chats found" })
  }
})

module.exports = router
