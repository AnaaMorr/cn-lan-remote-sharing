const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("offer", data => {
        socket.broadcast.emit("offer", data);
    });

    socket.on("answer", data => {
        socket.broadcast.emit("answer", data);
    });

    socket.on("ice-candidate", data => {
        socket.broadcast.emit("ice-candidate", data);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    const networkInterfaces = os.networkInterfaces();
    console.log("Accessible at:");
    for (const interfaceName in networkInterfaces) {
        const interfaces = networkInterfaces[interfaceName];
        for (const iface of interfaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                console.log(`  http://${iface.address}:${PORT}`);
            }
        }
    }
});