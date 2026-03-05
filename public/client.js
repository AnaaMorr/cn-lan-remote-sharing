let socket;
const pc = new RTCPeerConnection();
const statusDiv = document.getElementById("status");
const connectBtn = document.getElementById("connectBtn");
const serverIPInput = document.getElementById("serverIP");

const video = document.getElementById("remoteVideo");

function updateStatus(message, className) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${className}`;
}

function setConnecting() {
    updateStatus("Connecting...", "connecting");
    connectBtn.disabled = true;
    connectBtn.textContent = "Connecting...";
    serverIPInput.disabled = true;
}

function setConnected() {
    updateStatus("Connected", "connected");
    connectBtn.disabled = false;
    connectBtn.textContent = "Disconnect";
    serverIPInput.disabled = true;
    enableMouseControl();
}

function setDisconnected() {
    updateStatus("Not connected", "not-connected");
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    serverIPInput.disabled = false;
    disableMouseControl();
}

function enableMouseControl() {
    video.addEventListener('mousemove', handleMouseMove);
    video.addEventListener('mousedown', handleMouseDown);
    video.addEventListener('wheel', handleMouseWheel);
    video.style.cursor = 'crosshair';
}

function disableMouseControl() {
    video.removeEventListener('mousemove', handleMouseMove);
    video.removeEventListener('mousedown', handleMouseDown);
    video.removeEventListener('wheel', handleMouseWheel);
    video.style.cursor = 'default';
}

function getRelativePosition(event) {
    const rect = video.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

function handleMouseMove(event) {
    if (!socket || !socket.connected) return;
    const pos = getRelativePosition(event);
    socket.emit('mouse-move', pos);
}

function handleMouseDown(event) {
    if (!socket || !socket.connected) return;
    event.preventDefault();
    const pos = getRelativePosition(event);
    let button = 'left';
    if (event.button === 2) button = 'right';
    socket.emit('mouse-click', { button, double: false });
}

function handleMouseWheel(event) {
    if (!socket || !socket.connected) return;
    event.preventDefault();
    const deltaX = event.deltaX > 0 ? 1 : event.deltaX < 0 ? -1 : 0;
    const deltaY = event.deltaY > 0 ? 1 : event.deltaY < 0 ? -1 : 0;
    socket.emit('mouse-scroll', { x: deltaX, y: deltaY });
}

pc.ontrack = event => {
    video.srcObject = event.streams[0];
};

function connectToServer() {
    const serverIP = serverIPInput.value.trim();
    if (!serverIP) {
        alert("Please enter the server IP address.");
        return;
    }

    if (socket && socket.connected) {
        // Disconnect
        socket.disconnect();
        setDisconnected();
        return;
    }

    setConnecting();

    socket = io(`http://${serverIP}:3000`);

    socket.on("connect", () => {
        setConnected();
    });

    socket.on("disconnect", () => {
        setDisconnected();
    });

    socket.on("offer", async offer => {
        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", answer);
    });

    pc.onicecandidate = event => {
        if (event.candidate) {
            socket.emit("ice-candidate", event.candidate);
        }
    };

    socket.on("ice-candidate", async candidate => {
        await pc.addIceCandidate(candidate);
    });

    socket.on("connect_error", (error) => {
        updateStatus("Connection failed. Check IP address.", "not-connected");
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect";
        serverIPInput.disabled = false;
    });
}

connectBtn.addEventListener("click", connectToServer);

// Initialize status
setDisconnected();