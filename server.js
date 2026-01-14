

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const File = require("./models/file.js");
const User = require("./models/user.js");
const Log = require("./models/logs.js");
const Text = require("./models/text.js");

// In-memory storage for files and logs (for simplicity)









async function addLog(action, userId) {
  await Log.create({
    userId,
    action
  });
}




const app = express();
mongoose.connect(process.env.MONGO_URL)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ MongoDB Error:", err.message));

app.use(cors({
  origin: "https://cloud-vault-frontend-98mf.onrender.com",
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

app.options("*", cors({
  origin: "https://cloud-vault-frontend-98mf.onrender.com",
  credentials: true
}));


app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));










app.get("/", (req, res) => {
res.sendFile(path.join(__dirname, "frontend/index.html"));

});

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET
});



function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ message: "No token" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}



const upload = multer({ storage: multer.memoryStorage() });

app.post("/register",  async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔍 check user exists
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 🔐 hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 💾 save user
    await User.create({
      email,
      password: hashedPassword
    });

    res.json({ message: "Registered successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});






app.post("/login",  async (req, res) => {
  const { email, password } = req.body;

const user = await User.findOne({ email });

if (!user) {
  return res.status(401).json({ message: "Invalid credentials" });
}

const match = await bcrypt.compare(password, user.password);
if (!match) {
  return res.status(401).json({ message: "Invalid credentials" });
}

const token = jwt.sign(
  { userId: user._id, email: user.email },
  process.env.JWT_SECRET,
  { expiresIn: "1h" }
);

try {
  await addLog(`User ${user.email} logged in`, user._id);
} catch (e) {
  console.log("Log error:", e.message);
}



  res.json({ token });
});



app.post("/reset-password", auth, async (req, res) => {
  const { newPassword } = req.body;

  const hashed = await bcrypt.hash(newPassword, 10);

  await User.updateOne(
    { _id: req.user.userId },
    { password: hashed }
  );

  res.json({ message: "Password updated successfully" });
});








app.post("/upload", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    // 🔥 STEP 3A: folder/file path receive karo
    const folderPath = req.body.path || req.file.originalname;

    const result = await cloudinary.uploader.upload(
      `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`,
      { resource_type: "auto" }
    );

    // 🔥 STEP 3B: path ko save karo
await File.create({
  userId: req.user.userId,
  url: result.secure_url,
  public_id: result.public_id,
  type: result.resource_type,
  format: result.format,
  path: folderPath,
  size: req.file.size,        // 👈 ADD THIS
  createdAt: new Date()
});



  await addLog(`Uploaded: ${folderPath}`, req.user.userId);

    res.json({ url: result.secure_url });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



app.post("/text", auth,  async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ message: "No text provided" });
  }

  await Text.create({
    userId: req.user.userId,
    content
  });

  res.json({ message: "Text saved" });
});



app.get("/texts", auth, async (req, res) => {
  const texts = await Text.find({ userId: req.user.userId }).sort({ createdAt: -1 });
  res.json(texts);
});







app.get("/files", auth, async (req, res) => {
const userFiles = await File.find({ userId: req.user.userId });
res.json(userFiles);

});



app.delete("/delete/:public_id", auth, async (req, res) => {
  try {
    const { public_id } = req.params;

    // 🔍 MongoDB se file dhundo
    const file = await File.findOne({
      public_id,
      userId: req.user.userId
    });

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    // ☁️ Cloudinary se delete
    await cloudinary.uploader.destroy(file.public_id, {
      resource_type: file.type
    });

    // 🗑 MongoDB se delete
    await File.deleteOne({ _id: file._id });

  await addLog("File deleted", req.user.userId);

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});




app.delete("/text/:id", auth, async (req, res) => {
  if (!req.params.id) {
    return res.status(400).json({ message: "Text ID missing" });
  }

  await Text.deleteOne({
    _id: req.params.id,
    userId: req.user.userId
  });

  res.json({ message: "Deleted" });
});




app.get("/logs", auth, async (req, res) => {
  const userLogs = await Log.find({ userId: req.user.userId }).sort({ time: -1 });
  res.json(userLogs);
});

app.delete("/logs/clear", auth, async (req, res) => {
  try {
    await Log.deleteMany({ userId: req.user.userId });
    res.json({ message: "Logs cleared successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



app.delete("/account/delete", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // 1️⃣ User ki files nikalo
    const files = await File.find({ userId });

    // 2️⃣ Cloudinary se files delete
    for (const file of files) {
      await cloudinary.uploader.destroy(file.public_id, {
        resource_type: file.type
      });
    }

    // 3️⃣ MongoDB se sab delete
    await File.deleteMany({ userId });
    await Text.deleteMany({ userId });
    await Log.deleteMany({ userId });
    await User.deleteOne({ _id: userId });

    res.json({ message: "Account deleted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});



const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Backend running on", PORT));

