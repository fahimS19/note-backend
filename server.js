require("dotenv").config();
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const authRouter = require("./routes/auth/authRoute");
const folderRouter = require("./routes/folder/folderRouter");
const fileRouter = require("./routes/files/filerouter");
const authMiddleware = require("./middlewares/auth/authMiddleware");
const { tenantRouter } = require("./routes/tenants/tenantRouter");
const app = express();
const PORT = process.env.PORT || 5000;
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  message: {
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
});

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000", // frontend address
    credentials: true, // allowing cookies
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use("/api/", apiLimiter);
app.use("/api/auth", authRouter);
app.use("/api/tenants", authMiddleware, tenantRouter);
app.use("/api/folders", authMiddleware, folderRouter);
app.use("/api/files", authMiddleware, fileRouter);

app.use((err, _req, res, _next) => {
  console.error("Error caught in Global Handler:", err.stack);
  // Generic fallback for any other error (DB errors, syntax errors, etc.)
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Internal Server Error",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
