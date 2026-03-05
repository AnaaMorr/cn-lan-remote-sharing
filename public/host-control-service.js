/**
 * Host Control Service
 * 
 * This service runs locally on the host machine and receives control commands
 * from remote clients via the WebRTC data channel. It uses robotjs to execute
 * mouse and keyboard commands.
 * 
 * Run with: node public/host-control-service.js
 * 
 * Note: This is optional. If robotjs is not available, remote control will be disabled
 * but screen sharing will still work.
 */

let robot;
try {
    robot = require("robotjs");
    console.log("✓ robotjs loaded successfully");
} catch (e) {
    console.error("✗ robotjs not installed. Remote control will not work.");
    console.log("Install with: npm install robotjs");
    process.exit(1);
}

// Listen on a local port for control messages from the browser
const net = require("net");
const PORT = 9001;

const server = net.createServer((socket) => {
    console.log("Host control client connected");

    socket.on("data", (data) => {
        try {
            const command = JSON.parse(data.toString());
            handleCommand(command);
        } catch (e) {
            console.error("Invalid command:", e.message);
        }
    });

    socket.on("end", () => {
        console.log("Host control client disconnected");
    });

    socket.on("error", (e) => {
        console.error("Host control error:", e.message);
    });
});

function handleCommand(cmd) {
    switch (cmd.type) {
        case "mouse-move": {
            robot.moveMouse(cmd.x, cmd.y);
            break;
        }
        case "mouse-click": {
            if (cmd.button === "left") {
                robot.mouseClick("left", cmd.double);
            } else if (cmd.button === "right") {
                robot.mouseClick("right");
            } else if (cmd.button === "middle") {
                robot.mouseClick("middle");
            }
            break;
        }
        case "mouse-scroll": {
            robot.scrollMouse(cmd.x, cmd.y);
            break;
        }
        case "key-tap": {
            robot.typeString(cmd.text);
            break;
        }
        case "key-press": {
            const modifiers = cmd.modifiers || [];
            robot.keyTap(cmd.key, modifiers);
            break;
        }
        default:
            console.warn("Unknown command type:", cmd.type);
    }
}

server.listen(PORT, "127.0.0.1", () => {
    console.log(`\n🎮 Host Control Service listening on port ${PORT}`);
    console.log("Ready to receive remote control commands from clients\n");
});
