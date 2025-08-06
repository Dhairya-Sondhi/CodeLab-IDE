// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// --- SUPABASE SETUP ---
const SUPABASE_URL = 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- END SUPABASE SETUP ---

const app = express();

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://127.0.0.1:5173",
    "https://codelab-lyart.vercel.app"
  ],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api', require('./routes/execute'));

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: [
          "http://localhost:5173", 
          "http://127.0.0.1:5173",
          "https://codelab-lyart.vercel.app"
        ],
        methods: ["GET", "POST"]
    }
});

// In-memory storage for active room documents and users
const roomDocs = new Map();
const roomUsers = new Map();

// --- DATABASE HELPER FUNCTIONS ---
const loadDocFromDB = async (roomId) => {
    const { data, error } = await supabase
        .from('rooms')
        .select('content')
        .eq('id', roomId)
        .single();
    if (error && error.code !== 'PGRST116') {
        console.error('Error loading doc:', error);
        return null;
    }
    return data ? new Uint8Array(Buffer.from(data.content, 'base64')) : null;
};

const saveDocToDB = async (roomId, ydoc) => {
    const content = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64');
    const { error } = await supabase
        .from('rooms')
        .upsert({ id: roomId, content: content }, { onConflict: 'id' });
    if (error) {
        console.error('Error saving doc:', error);
    } else {
        console.log(`Successfully saved doc for room: ${roomId}`);
    }
};
// --- END DATABASE HELPER FUNCTIONS ---

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    const connectedRooms = new Set();

    socket.on('join-room', async ({ roomId, user }) => {
        socket.join(roomId);
        connectedRooms.add(roomId);
        console.log(`User ${socket.id} (${user?.name}) joined room ${roomId}`);

        // Track users in room
        if (!roomUsers.has(roomId)) {
            roomUsers.set(roomId, new Map());
        }
        roomUsers.get(roomId).set(socket.id, user);

        // Load or create document
        let doc = roomDocs.get(roomId);
        if (!doc) {
            doc = new Y.Doc();
            roomDocs.set(roomId, doc);
            
            const dbContent = await loadDocFromDB(roomId);
            if (dbContent) {
                Y.applyUpdate(doc, dbContent);
                console.log(`Loaded document for room ${roomId} from database.`);
            } else {
                doc.getMap('metadata').set('language', 'javascript');
            }
        }
        
        // Send initial document state
        const docState = Y.encodeStateAsUpdate(doc);
        socket.emit('doc-sync', docState);

        // Notify others about new user
        socket.to(roomId).emit('user-joined', user);

        // Send current users list to new user
        const currentUsers = Array.from(roomUsers.get(roomId).values());
        socket.emit('room-users', currentUsers);
    });

    socket.on('doc-update', ({ roomId, update }) => {
        const updateBuffer = new Uint8Array(update);
        const doc = roomDocs.get(roomId);
        if (doc) {
            Y.applyUpdate(doc, updateBuffer);
            socket.to(roomId).emit('doc-update', updateBuffer);
        }
    });

    socket.on('language-change', ({ roomId, language }) => {
        const doc = roomDocs.get(roomId);
        if (doc) {
            doc.getMap('metadata').set('language', language);
            socket.to(roomId).emit('language-changed', language);
        }
    });

    // NEW: Handle cursor position updates
    socket.on('cursor-position', ({ roomId, position, user }) => {
        // Broadcast cursor position to all other users in the room
        socket.to(roomId).emit('cursor-position', {
            userId: socket.id,
            position: position,
            user: user
        });
    });

    // NEW: Handle selection changes
    socket.on('selection-change', ({ roomId, selection, user }) => {
        socket.to(roomId).emit('selection-change', {
            userId: socket.id,
            selection: selection,
            user: user
        });
    });

    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        
        for (const roomId of connectedRooms) {
            // Remove user from room users tracking
            if (roomUsers.has(roomId)) {
                const user = roomUsers.get(roomId).get(socket.id);
                roomUsers.get(roomId).delete(socket.id);
                
                if (user) {
                    socket.to(roomId).emit('user-left', user.id);
                }

                // Clean up empty rooms
                if (roomUsers.get(roomId).size === 0) {
                    roomUsers.delete(roomId);
                }
            }

            // Check if room is now empty
            const room = io.sockets.adapter.rooms.get(roomId);
            if (!room || room.size === 0) {
                const docToSave = roomDocs.get(roomId);
                if (docToSave) {
                    await saveDocToDB(roomId, docToSave);
                    roomDocs.delete(roomId);
                    console.log(`Room ${roomId} is now empty. Saving to DB and clearing from memory.`);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3001; 
server.listen(PORT, () => {
    console.log(`Backend server listening on port ${PORT}`);
});
