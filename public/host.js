const socket = io();

const pc = new RTCPeerConnection();

const video = document.getElementById("localVideo");

async function startShare() {

    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true
    });

    video.srcObject = stream;

    stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socket.emit("offer", offer);
}

pc.onicecandidate = event => {
    if (event.candidate) {
        socket.emit("ice-candidate", event.candidate);
    }
};

socket.on("answer", async answer => {
    await pc.setRemoteDescription(answer);
});

startShare();