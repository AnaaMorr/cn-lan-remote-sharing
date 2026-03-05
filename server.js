const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static("public"));

// Room management
const rooms = new Map();

// Serve home page
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// Create a new room
app.post("/api/room/create", (req, res) => {
    const roomId = uuidv4().substring(0, 8).toUpperCase();
    rooms.set(roomId, { hostId: null, clients: [], createdAt: Date.now() });
    console.log(`📍 Room created: ${roomId} (Total rooms: ${rooms.size})`);
    res.json({ 
        roomId, 
        url: `${getFirstLanIP()}:${process.env.PORT || 3000}/room-client.html?room=${roomId}`
    });
});

// Get first available LAN IP
function getFirstLanIP() {
    const networkInterfaces = os.networkInterfaces();
    for (const ifaceName in networkInterfaces) {
        const iface = networkInterfaces[ifaceName];
        for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) {
                return `http://${alias.address}`;
            }
        }
    }
    return 'http://localhost';
}

// Get room info
app.get("/api/room/:roomId", (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
        return res.status(404).json({ error: "Room not found" });
    }
    res.json({ roomId: req.params.roomId, hasHost: !!room.hostId });
});

// Serve room pages
app.get("/room/:roomId", (req, res) => {
    const room = rooms.get(req.params.roomId);
    if (!room) {
        return res.status(404).send("Room not found");
    }
    // Redirect to client page with room ID as query parameter
    res.redirect(`/room-client.html?room=${req.params.roomId}`);
});

app.get("/api/ips", (req, res) => {
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];
    for (const ifaceName in networkInterfaces) {
        const iface = networkInterfaces[ifaceName];
        for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) {
                addresses.push(`http://${alias.address}:${process.env.PORT || 3000}`);
            }
        }
    }
    res.json(addresses);
});

// WebSocket signaling
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // Host joins room
    socket.on("host-join", ({ roomId }, callback) => {
        console.log(`🎤 Host attempting to join room: ${roomId}`);
        
        const room = rooms.get(roomId);
        if (!room) {
            console.log(`❌ Room ${roomId} not found for host join`);
            return callback({ success: false, error: "Room not found" });
        }
        if (room.hostId) {
            console.log(`❌ Host already connected to room ${roomId}`);
            return callback({ success: false, error: "Host already connected" });
        }

        room.hostId = socket.id;
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = "host";

        console.log(`✓ Host joined room ${roomId}`);
        callback({ success: true, roomId });
        io.to(roomId).emit("host-status", { connected: true });
    });

    // Client joins room
    socket.on("client-join", ({ roomId }, callback) => {
        console.log(`👤 Client attempting to join room: ${roomId} (Available rooms: ${Array.from(rooms.keys()).join(', ') || 'none'})`);
        
        const room = rooms.get(roomId);
        if (!room) {
            console.log(`❌ Room ${roomId} not found`);
            return callback({ success: false, error: "Room not found" });
        }
        if (!room.hostId) {
            console.log(`⚠️ Host not connected in room ${roomId}`);
            return callback({ success: false, error: "Host not connected" });
        }

        room.clients.push(socket.id);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = "client";

        console.log(`✓ Client joined room ${roomId} (Total clients: ${room.clients.length})`);
        callback({ success: true, roomId, hostId: room.hostId });
        io.to(room.hostId).emit("client-connected", { clientId: socket.id });
    });

    // Relay WebRTC signaling messages
    socket.on("offer", ({ to, offer }) => {
        io.to(to).emit("offer", { from: socket.id, offer });
    });

    socket.on("answer", ({ to, answer }) => {
        io.to(to).emit("answer", { from: socket.id, answer });
    });

    socket.on("ice-candidate", ({ to, candidate }) => {
        io.to(to).emit("ice-candidate", { from: socket.id, candidate });
    });

    // Control messages (mouse, keyboard) via signaling server to host
    socket.on("control-message", ({ roomId, type, data }) => {
        const room = rooms.get(roomId);
        if (!room || !room.hostId) return;
        io.to(room.hostId).emit("control-message", { client: socket.id, type, data });
    });

    // Disconnect handling
    socket.on("disconnect", () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        if (socket.data.role === "host") {
            room.hostId = null;
            io.to(roomId).emit("host-status", { connected: false });
            console.log(`Host disconnected from room ${roomId}`);
        } else if (socket.data.role === "client") {
            room.clients = room.clients.filter(id => id !== socket.id);
            if (room.hostId) {
                io.to(room.hostId).emit("client-disconnected", { clientId: socket.id });
            }
            console.log(`Client disconnected from room ${roomId}`);
        }

        // Cleanup empty rooms after 5 minutes
        if (!room.hostId && room.clients.length === 0) {
            setTimeout(() => {
                if (rooms.get(roomId) && !rooms.get(roomId).hostId && rooms.get(roomId).clients.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted`);
                }
            }, 5 * 60 * 1000);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 Remote Desktop Signaling Server running on port ${PORT}`);
    const networkInterfaces = os.networkInterfaces();
    console.log("Accessible at:");
    for (const ifaceName in networkInterfaces) {
        const iface = networkInterfaces[ifaceName];
        for (const alias of iface) {
            if (alias.family === "IPv4" && !alias.internal) {
                console.log(`  http://${alias.address}:${PORT}`);
            }
        }
    }
    console.log("");
});
