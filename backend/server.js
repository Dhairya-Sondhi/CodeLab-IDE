// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');

// --- SUPABASE SETUP ---
// IMPORTANT: Replace with your actual Supabase URL and Anon Key!
const SUPABASE_URL = 'https://zwkulpxvixgtgopumgjc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3a3VscHh2aXhndGdvcHVtZ2pjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDcxOTUsImV4cCI6MjA2OTk4MzE5NX0.j2uEXTFkG6MZcAkzUDjgcnB14sfkkmVVsJaiJ8hqqwM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// --- END SUPABASE SETUP ---

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "https://codelab-lyart.vercel.app", // Your Vercel URL is configured
        methods: ["GET", "POST"]
    }
});

// In-memory storage for active room documents
const roomDocs = new Map();

// --- DATABASE HELPER FUNCTIONS ---
const loadDocFromDB = async (roomId) => {
    const { data, error } = await supabase
        .from('rooms')
        .select('content')
        .eq('id', roomId)
        .single();
    if (error && error.code !== 'PGRST116') { // PGRST116 = 'No rows found'
        console.error('Error loading doc:', error);
        return null;
    }
    // Supabase returns bytea as a string, so we need to convert it back to a buffer
    return data ? new Uint8Array(Buffer.from(data.content, 'binary')) : null;
};

const saveDocToDB = async (roomId, ydoc) => {
    // Convert Uint8Array to a format Supabase bytea understands (binary string)
    const content = Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('binary');
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

    socket.on('join-room', async (roomId) => {
        socket.join(roomId);
        connectedRooms.add(roomId);
        console.log(`User ${socket.id} joined room ${roomId}`);

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
        
        const docState = Y.encodeStateAsUpdate(doc);
        socket.emit('doc-sync', docState);
    });

    socket.on('doc-update', ({ roomId, update }) => {
        const updateBuffer = new Uint8Array(update);
        const doc = roomDocs.get(roomId);
        if (doc) {
            Y.applyUpdate(doc, updateBuffer);
            socket.to(roomId).emit('doc-update', updateBuffer);
        }
    });

    socket.on('disconnect', async () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const roomId of connectedRooms) {
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