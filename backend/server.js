// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors()); // Use cors middleware

const server = http.createServer(app);

// IMPORTANT: Configure CORS for Socket.IO
const io = new Server(server, {
    cors: {
        // Replace this with your Vercel frontend URL when you have it
        origin: "*", // For local testing, "*" is okay. For production, be more specific.
        methods: ["GET", "POST"]
    }
});

app.get('/', (req, res) => {
    res.send('Backend server is running!');
});

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
    });
});

// Render will automatically use the PORT environment variable.
const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});