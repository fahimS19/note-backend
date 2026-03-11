require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const authRouter = require("./routes/auth/authRoute");
const folderRouter = require("./routes/folder/folderRouter");
const fileRouter = require("./routes/files/filerouter");
const authMiddleware = require("./middlewares/auth/authMiddleware");
const { tenantRouter } = require("./routes/tenants/tenantRouter");
const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: "http://localhost:3000", // frontend address
    credentials: true, // allowing cookies
  }),
);
app.use(express.json());
app.use(cookieParser());
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
