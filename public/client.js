const socket = io();

const pc = new RTCPeerConnection();

const video = document.getElementById("remoteVideo");

pc.ontrack = event => {
    video.srcObject = event.streams[0];
};

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