const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String },
  imageUrls: [String],
  audioUrls: [String],
  documentUrls: [String],
  timestamp: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false },
  seenAt: { type: Date },
})

module.exports = mongoose.model("Message", messageSchema)
