const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const os = require("os");

let robot;
try {
    robot = require("robotjs");
} catch (e) {
    console.warn("robotjs not installed. Mouse control will not work.");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// provide a simple API for the host page to list accessible IPs
app.get('/ips', (req, res) => {
    const networkInterfaces = os.networkInterfaces();
    const addresses = [];
    for (const ifaceName in networkInterfaces) {
        const iface = networkInterfaces[ifaceName];
        for (const alias of iface) {
            if (alias.family === 'IPv4' && !alias.internal) {
                addresses.push(`http://${alias.address}:${PORT}`);
            }
        }
    }
    res.json(addresses);
});

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

    // Mouse control events
    if (robot) {
        socket.on("mouse-move", (data) => {
            const screenSize = robot.getScreenSize();
            const x = Math.round(data.x * screenSize.width);
            const y = Math.round(data.y * screenSize.height);
            robot.moveMouse(x, y);
        });

        socket.on("mouse-click", (data) => {
            if (data.button === 'left') {
                robot.mouseClick(data.double ? 'left' : 'left', data.double);
            } else if (data.button === 'right') {
                robot.mouseClick('right');
            }
        });

        socket.on("mouse-scroll", (data) => {
            robot.scrollMouse(data.x, data.y);
        });
    }
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