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

// In-memory room storage with message queue
const rooms = new Map();
const roomQueues = new Map();
const roomUsers = new Map();
const userCursors = new Map(); // Track cursor positions for each user

// Message queue implementation
class MessageQueue {
  constructor(roomId) {
    this.roomId = roomId;
    this.queue = [];
    this.processing = false;
    this.lastProcessedTime = 0;
    this.debounceTimers = new Map(); // For debouncing different message types
  }

  add(message) {
    this.queue.push({
      ...message,
      timestamp: Date.now(),
      id: uuidv4()
    });
    this.process();
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    // Process messages in batches to prevent overwhelming
    const batchSize = 10;
    let processed = 0;
    
    while (this.queue.length > 0 && processed < batchSize) {
      const message = this.queue.shift();
      
      // Process message based on type
      switch (message.type) {
        case 'code-change':
          await this.processCodeChange(message);
          break;
        case 'cursor-change':
          await this.processCursorChange(message);
          break;
        case 'stdin-change':
          await this.processStdinChange(message);
          break;
        case 'flags-change':
          await this.processFlagsChange(message);
          break;
        default:
          break;
      }
      
      processed++;
      
      // Small delay to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    this.processing = false;
    
    // Continue processing if there are more messages
    if (this.queue.length > 0) {
      setTimeout(() => this.process(), 100);
    }
  }

  async processCodeChange(message) {
    const { roomId, code, userId, position, timestamp } = message.data;
    
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      
      // Only update if this change is newer than the last one
      if (timestamp > room.lastCodeUpdate) {
        room.code = code;
        room.lastCodeUpdate = timestamp;
        room.lastUpdated = timestamp;
        
        // Update user cursor position
        if (position) {
          const userCursorKey = `${roomId}:${userId}`;
          userCursors.set(userCursorKey, {
            position,
            timestamp,
            roomId,
            userId
          });
        }
        
        // Broadcast to all users in room except sender
        message.socket.to(roomId).emit("code-update", {
          code,
          userId,
          position,
          timestamp
        });
      }
    }
  }

  async processCursorChange(message) {
    const { roomId, userId, position } = message.data;
    
    // Store cursor position
    const userCursorKey = `${roomId}:${userId}`;
    userCursors.set(userCursorKey, {
      position,
      timestamp: Date.now(),
      roomId,
      userId
    });
    
    // Broadcast cursor position to all users in room except sender
    message.socket.to(roomId).emit("cursor-update", {
      userId,
      position
    });
  }

  async processStdinChange(message) {
    const { roomId, stdin } = message.data;
    
    if (rooms.has(roomId)) {
      rooms.get(roomId).stdin = stdin;
      rooms.get(roomId).lastUpdated = Date.now();
      
      // Broadcast to all users in room except sender
      message.socket.to(roomId).emit("stdin-update", { stdin });
    }
  }

  async processFlagsChange(message) {
    const { roomId, flags } = message.data;
    
    if (rooms.has(roomId)) {
      rooms.get(roomId).flags = flags;
      rooms.get(roomId).lastUpdated = Date.now();
      
      // Broadcast to all users in room except sender
      message.socket.to(roomId).emit("flags-update", { flags });
    }
  }
}

// Utility to stringify errors
const stringifyError = (err) =>
  typeof err === "object" ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2) : String(err);

// Clean up old cursor positions periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 60000; // 1 minute
  
  for (const [key, cursor] of userCursors.entries()) {
    if (now - cursor.timestamp > maxAge) {
      userCursors.delete(key);
    }
  }
}, 30000); // Clean up every 30 seconds

// Socket.IO handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    // Initialize room if doesn't exist
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
        stderr: "",
        lastUpdated: Date.now(),
        lastCodeUpdate: Date.now()
      });
      roomQueues.set(roomId, new MessageQueue(roomId));
      roomUsers.set(roomId, new Set());
    }

    // Add user to room
    roomUsers.get(roomId).add(socket.id);

    // Send current room state to the new user
    const roomState = rooms.get(roomId);
    socket.emit("room-state", roomState);
    
    // Send existing cursor positions to the new user
    const existingCursors = [];
    for (const [key, cursor] of userCursors.entries()) {
      if (cursor.roomId === roomId && cursor.userId !== socket.id) {
        existingCursors.push({
          userId: cursor.userId,
          position: cursor.position
        });
      }
    }
    
    if (existingCursors.length > 0) {
      socket.emit("existing-cursors", existingCursors);
    }
    
    // Notify other users in the room
    socket.to(roomId).emit("user-joined", { userId: socket.id });
    
    // Send updated user count to all users in room
    const userCount = roomUsers.get(roomId).size;
    io.to(roomId).emit("user-count-update", { count: userCount });
  });

  socket.on("code-change", (data) => {
    const { roomId } = data;
    
    if (rooms.has(roomId) && roomQueues.has(roomId)) {
      const queue = roomQueues.get(roomId);
      queue.add({
        type: 'code-change',
        data: { ...data, userId: socket.id },
        socket: socket
      });
    }
  });

  socket.on("cursor-change", (data) => {
    const { roomId } = data;
    
    if (rooms.has(roomId) && roomQueues.has(roomId)) {
      const queue = roomQueues.get(roomId);
      queue.add({
        type: 'cursor-change',
        data: { ...data, userId: socket.id },
        socket: socket
      });
    }
  });

  socket.on("stdin-change", ({ roomId, stdin }) => {
    if (rooms.has(roomId) && roomQueues.has(roomId)) {
      const queue = roomQueues.get(roomId);
      queue.add({
        type: 'stdin-change',
        data: { roomId, stdin },
        socket: socket
      });
    }
  });

  socket.on("flags-change", ({ roomId, flags }) => {
    if (rooms.has(roomId) && roomQueues.has(roomId)) {
      const queue = roomQueues.get(roomId);
      queue.add({
        type: 'flags-change',
        data: { roomId, flags },
        socket: socket
      });
    }
  });

  socket.on("run-code", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const roomData = rooms.get(roomId);
      executeCode(roomData.code, roomData.stdin, roomData.flags, (result) => {
        if (rooms.has(roomId)) {
          rooms.get(roomId).stdout = result.stdout;
          rooms.get(roomId).stderr = result.stderr;
          rooms.get(roomId).lastUpdated = Date.now();
        }
        io.to(roomId).emit("execution-result", result);
      });
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    
    // Remove user from all rooms
    roomUsers.forEach((users, roomId) => {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        
        // Remove user's cursor position
        const userCursorKey = `${roomId}:${socket.id}`;
        userCursors.delete(userCursorKey);
        
        // Notify other users
        socket.to(roomId).emit("user-left", { userId: socket.id });
        
        // Send updated user count
        const userCount = users.size;
        io.to(roomId).emit("user-count-update", { count: userCount });
        
        // Clean up empty rooms
        if (users.size === 0) {
          rooms.delete(roomId);
          roomQueues.delete(roomId);
          roomUsers.delete(roomId);
          
          // Clean up cursor positions for this room
          for (const [key, cursor] of userCursors.entries()) {
            if (cursor.roomId === roomId) {
              userCursors.delete(key);
            }
          }
          
          console.log(`Room ${roomId} cleaned up (empty)`);
        }
      }
    });
  });

  // Handle explicit room leaving
  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    
    if (roomUsers.has(roomId)) {
      roomUsers.get(roomId).delete(socket.id);
      
      // Remove user's cursor position
      const userCursorKey = `${roomId}:${socket.id}`;
      userCursors.delete(userCursorKey);
      
      socket.to(roomId).emit("user-left", { userId: socket.id });
      
      // Send updated user count
      const userCount = roomUsers.get(roomId).size;
      io.to(roomId).emit("user-count-update", { count: userCount });
      
      // Clean up empty rooms
      if (roomUsers.get(roomId).size === 0) {
        rooms.delete(roomId);
        roomQueues.delete(roomId);
        roomUsers.delete(roomId);
        
        // Clean up cursor positions for this room
        for (const [key, cursor] of userCursors.entries()) {
          if (cursor.roomId === roomId) {
            userCursors.delete(key);
          }
        }
        
        console.log(`Room ${roomId} cleaned up (empty)`);
      }
    }
  });
});

// C++ Code Execution Logic
function executeCode(code, stdin, flags, callback) {
  const dirPath = path.join("/tmp", `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  
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
        fs.rmSync(dirPath, { recursive: true, force: true });
        return callback({ status: 500, stderr: "Failed to write file", stdout: "" });
      }

      // Compile the code
      exec(`g++ ${flags} "${cppFilePath}" -o "${executablePath}"`, (error, stdout, stderr) => {
        if (error) {
          console.error("Compilation error:", error);
          fs.rmSync(dirPath, { recursive: true, force: true });
          return callback({ status: 400, stderr: stderr || error.message, stdout: "" });
        }

        // Execute the compiled program
        const child = spawn(executablePath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 10000
        });
        
        let output = "";
        let errorOutput = "";
        let isFinished = false;
        
        // Set up timeout
        const timeoutId = setTimeout(() => {
          if (!isFinished) {
            isFinished = true;
            child.kill("SIGKILL");
            fs.rmSync(dirPath, { recursive: true, force: true });
            callback({ 
              status: 408, 
              stderr: "Execution timeout (10s limit)", 
              stdout: output 
            });
          }
        }, 10000);

        // Provide stdin input
        if (stdin) {
          child.stdin.write(stdin);
        }
        child.stdin.end();

        child.stdout.on("data", (data) => {
          output += data.toString();
        });

        child.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        child.on("close", (code) => {
          if (!isFinished) {
            isFinished = true;
            clearTimeout(timeoutId);
            
            // Clean up temporary files
            fs.rmSync(dirPath, { recursive: true, force: true });
            
            callback({ 
              status: 200, 
              stderr: errorOutput, 
              stdout: output, 
              exitCode: code 
            });
          }
        });

        child.on("error", (err) => {
          if (!isFinished) {
            isFinished = true;
            clearTimeout(timeoutId);
            console.error("Execution error:", err);
            fs.rmSync(dirPath, { recursive: true, force: true });
            callback({ 
              status: 500, 
              stderr: err.message, 
              stdout: output 
            });
          }
        });
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

// Get room info API
app.get("/room/:roomId", (req, res) => {
  const roomId = req.params.roomId;
  
  if (rooms.has(roomId)) {
    const roomData = rooms.get(roomId);
    const userCount = roomUsers.has(roomId) ? roomUsers.get(roomId).size : 0;
    
    res.json({
      exists: true,
      userCount,
      lastUpdated: roomData.lastUpdated
    });
  } else {
    res.json({ exists: false });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size,
    totalUsers: Array.from(roomUsers.values()).reduce((sum, users) => sum + users.size, 0),
    activeCursors: userCursors.size
  });
});

// 404 fallback
app.get("*", (req, res) => res.sendStatus(404));

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
