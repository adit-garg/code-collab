const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// CORS middleware
app.use("/", (req, resp, next) => {
  resp.header("Access-Control-Allow-Credentials", true);
  resp.header("Access-Control-Allow-Origin", process.env.CLIENT_ORIGIN || "http://localhost:3000");
  resp.header("Access-Control-Allow-Headers", "Content-Type, GET, POST, OPTIONS");
  next();
});

// In-memory room storage
const rooms = new Map();

// Utility to stringify errors
const stringifyError = (err) =>
  typeof err === "object" ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2) : String(err);

// Socket.IO handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        code: `#include <iostream>
using namespace std;

int main() {
  cout << "Hello World !!";
}`,
        stdin: "",
        flags: "-std=c++17 -Wall",
        stdout: "Hello World !!",
        stderr: ""
      });
    }

    socket.emit("room-state", rooms.get(roomId));
    socket.to(roomId).emit("user-joined", { userId: socket.id });
  });

  socket.on("code-change", ({ roomId, code }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).code = code;
      socket.to(roomId).emit("code-update", { code });
    }
  });

  socket.on("stdin-change", ({ roomId, stdin }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).stdin = stdin;
      socket.to(roomId).emit("stdin-update", { stdin });
    }
  });

  socket.on("flags-change", ({ roomId, flags }) => {
    if (rooms.has(roomId)) {
      rooms.get(roomId).flags = flags;
      socket.to(roomId).emit("flags-update", { flags });
    }
  });

  socket.on("run-code", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      executeCode(roomData.code, roomData.stdin, roomData.flags, (result) => {
        rooms.get(roomId).stdout = result.stdout;
        rooms.get(roomId).stderr = result.stderr;
        io.to(roomId).emit("execution-result", result);
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// C++ Code Execution Logic
function executeCode(code, stdin, flags, callback) {
  const dirPath = path.join("/tmp", Date.now().toString());
  fs.mkdir(dirPath, { recursive: true }, (err) => {
    if (err) {
      console.error("Failed to create directory:", err);
      return callback({ status: 500, stderr: "Failed to create directory", stdout: "" });
    }

    const cppFilePath = path.join(dirPath, "main.cpp");
    const executablePath = path.join(dirPath, "a.out");

    fs.writeFile(cppFilePath, code, (err) => {
      if (err) {
        console.error("Failed to write file:", err);
        return callback({ status: 500, stderr: "Failed to write file", stdout: "" });
      }

      exec(`g++ ${flags} ${cppFilePath} -o ${executablePath}`, (error, stdout, stderr) => {
        if (error) {
          console.error("Compilation error:", error);
          fs.rmSync(dirPath, { recursive: true, force: true });
          return callback({ status: 400, stderr: stderr || error.message, stdout: "" });
        }

        // Execute the compiled program
        const child = spawn(executablePath);
        
        // Provide stdin input
        if (stdin) {
          child.stdin.write(stdin);
        }
        child.stdin.end();

        let output = "";
        let errorOutput = "";

        child.stdout.on("data", (data) => {
          output += data.toString();
        });

        child.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        child.on("close", (code) => {
          // Clean up temporary files
          fs.rmSync(dirPath, { recursive: true, force: true });
          
          return callback({ 
            status: 200, 
            stderr: errorOutput, 
            stdout: output, 
            err: null 
          });
        });

        child.on("error", (err) => {
          console.error("Execution error:", err);
          fs.rmSync(dirPath, { recursive: true, force: true });
          callback({ 
            status: 500, 
            stderr: err.message, 
            stdout: output 
          });
        });

        // Set execution timeout
        setTimeout(() => {
          child.kill("SIGKILL");
          fs.rmSync(dirPath, { recursive: true, force: true });
          callback({ 
            status: 408, 
            stderr: "Execution timeout (10s limit)", 
            stdout: output 
          });
        }, 10000);
      });
    });
  });
}

// Create Room API
app.post("/create-room", (req, res) => {
  try {
    const roomId = uuidv4();
    res.json({ roomId });
  } catch (error) {
    console.error("ERROR", JSON.stringify(error, null, 2));
    if (!res.headersSent) {
      res.status(500).json({ error: JSON.stringify(error, null, 2) });
    }
  }
});

// Run Code API
app.post("/run-cpp", async (req, res) => {
  try {
    const { code, stdin, flags } = req.body;
    executeCode(code, stdin || "", flags || "-std=c++17 -Wall", (result) => {
      if (!res.headersSent) {
        res.status(result.status || 200).json(result);
      }
    });
  } catch (error) {
    console.error("Run CPP Error:", JSON.stringify(error, null, 2));
    if (!res.headersSent) {
      res.status(500).json({ error: JSON.stringify(error, null, 2) });
    }
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// 404 fallback
app.get("*", (req, res) => res.sendStatus(404));

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", JSON.stringify(err, null, 2));
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", JSON.stringify(reason, null, 2));
});