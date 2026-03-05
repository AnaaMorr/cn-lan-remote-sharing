let socket;
const pc = new RTCPeerConnection();

const video = document.getElementById("remoteVideo");

pc.ontrack = event => {
    video.srcObject = event.streams[0];
};

function connectToServer() {
    const serverIP = document.getElementById("serverIP").value;
    if (!serverIP) {
        alert("Please enter the server IP address.");
        return;
    }
    socket = io(`http://${serverIP}:3000`);

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
}

document.getElementById("connectBtn").addEventListener("click", connectToServer);