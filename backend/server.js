// backend/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Y = require('yjs');
const { createClient } = require('@supabase/supabase-js');

// --- SUPABASE SETUP ---
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

// --- DATABASE HELPER FUNCTIONS (CORRECTED WITH BASE64) ---
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
    // CORRECTED: If data exists, decode it from a base64 string back into a Uint8Array
    return data ? new Uint8Array(Buffer.from(data.content, 'base64')) : null;
};

const saveDocToDB = async (roomId