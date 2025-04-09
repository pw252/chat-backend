const express = require("express")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const User = require("../models/User")

const router = express.Router()

router.post("/register", async (req, res) => {
  const { username, password } = req.body
  const hashedPassword = await bcrypt.hash(password, 10)

  const user = new User({ username, password: hashedPassword })
  await user.save()

  res.status(201).send("User registered successfully")
})

router.post("/login", async (req, res) => {
  const { username, password } = req.body

  const user = await User.findOne({ username })
  if (!user) return res.status(400).send("User not found")

  const isMatch = await bcrypt.compare(password, user.password)
  if (!isMatch) return res.status(400).send("Invalid credentials")

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" })
  res.json({ token, user: { id: user._id, username: user.username } })
})

router.get("/users", async (req, res) => {
  try {
    const users = await User.find()
    res.status(200).json(users)
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" })
  }
})

module.exports = router
