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
}

function setDisconnected() {
    updateStatus("Not connected", "not-connected");
    connectBtn.disabled = false;
    connectBtn.textContent = "Connect";
    serverIPInput.disabled = false;
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