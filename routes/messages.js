const express = require("express")
const Message = require("../models/Message")

const router = express.Router()

router.get("/", async (req, res) => {
  const { userId, chatWithId } = req.query
  const messages = await Message.find({
    $or: [
      { sender: userId, receiver: chatWithId },
      { sender: chatWithId, receiver: userId },
    ],
  }).populate("sender receiver", "username")
  res.json(messages)
})

router.post("/seen", async (req, res) => {
  const { userId, chatWithId } = req.body

  const result = await Message.updateMany(
    { sender: chatWithId, receiver: userId, seen: false },
    { $set: { seen: true, seenAt: new Date() } }
  )

  res.status(200).json({ updated: result.modifiedCount })
})

module.exports = router
