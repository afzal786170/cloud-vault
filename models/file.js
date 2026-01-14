const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  url: String,
  public_id: String,
  type: String,
  format: String,
  path: String,
  size: Number,               // 👈 ADD
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("File", fileSchema);
