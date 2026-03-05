/**
 * Host - Room-based Screen Sharing
 * 
 * Handles:
 * - WebRTC peer connection with clients
 * - Screen capture and streaming
 * - Receiving control messages from clients
 * - Managing multiple client connections
 */

const socket = io();
const roomId = new URLSearchParams(window.location.search).get('room');
let peerConnections = new Map();
let controlService = null;
let isSharing = false;

// Update UI elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const videoElement = document.getElementById('localVideo');
const shareLink = document.getElementById('shareLink');
const connectionStatus = document.getElementById('connectionStatus');
const statusDot = document.getElementById('statusDot');
const clientsList = document.getElementById('clientsList');
const clientCount = document.getElementById('clientCount');

// Initialize share link with correct IP (not localhost)
async function initializeShareLink() {
    try {
        const response = await fetch('/api/ips');
        const ips = await response.json();
        
        // Use the first available IP (usually the LAN IP)
        const serverIp = ips[0] || window.location.origin;
        const linkUrl = `${serverIp}/room-client.html?room=${roomId}`;
        shareLink.textContent = linkUrl;
        console.log('✓ Share link ready:', linkUrl);
    } catch (e) {
        // Fallback to current origin if IP fetch fails
        const linkUrl = `${window.location.origin}/room-client.html?room=${roomId}`;
        shareLink.textContent = linkUrl;
        console.warn('Failed to fetch server IPs, using fallback:', linkUrl);
    }
}

initializeShareLink();

// Verify room exists
fetch(`/api/room/${roomId}`)
    .then(r => {
        if (r.ok) {
            console.log('✓ Room ID verified:', roomId);
        } else {
            console.error('✗ Room ID not found on server:', roomId);
            alert('Room not found on server. Please refresh and try again.');
        }
    })
    .catch(e => console.error('Failed to verify room:', e));

// Connect to signaling server
socket.emit('host-join', { roomId }, (response) => {
    if (response.success) {
        console.log('✓ Host joined room:', roomId);
        updateConnectionStatus(true);
    } else {
        console.error('✗ Failed to join room:', response.error);
        alert('Failed to join room: ' + response.error);
        goHome();
    }
});

// Listen for client connections
socket.on('client-connected', ({ clientId }) => {
    console.log('Client connected:', clientId);
    createPeerConnection(clientId);
    updateClientsList();
});

// Listen for client disconnections
socket.on('client-disconnected', ({ clientId }) => {
    console.log('Client disconnected:', clientId);
    if (peerConnections.has(clientId)) {
        peerConnections.get(clientId).close();
        peerConnections.delete(clientId);
    }
    updateClientsList();
});

// Receive WebRTC answer from client
socket.on('answer', ({ from, answer }) => {
    const pc = peerConnections.get(from);
    if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(answer))
            .catch(e => console.error('Failed to set remote description:', e));
    }
});

// Receive ICE candidates from client
socket.on('ice-candidate', ({ from, candidate }) => {
    const pc = peerConnections.get(from);
    if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error('Failed to add ICE candidate:', e));
    }
});

// Receive control messages from client
socket.on('control-message', ({ client, type, data }) => {
    if (!controlService) {
        console.warn('Control service not available');
        return;
    }
    
    // Forward control command to local service
    const command = { type, ...data };
    console.log('Control command:', command);
    
    // In production, send to localhost:9001 control service
    // For now, just log
    try {
        const ws = new WebSocket('ws://localhost:9001');
        ws.onopen = () => {
            ws.send(JSON.stringify(command));
            ws.close();
        };
    } catch (e) {
        // Control service not available
    }
});

// Handle host disconnection
socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

/**
 * Create WebRTC peer connection and offer
 */
function createPeerConnection(clientId) {
    console.log('Creating peer connection for client:', clientId);
    
    const pc = new RTCPeerConnection({
        iceServers: [
            { urls: ['stun:stun.l.google.com:19302'] },
            { urls: ['stun:stun1.l.google.com:19302'] }
        ]
    });
    
    peerConnections.set(clientId, pc);
    
    // Add screen stream if sharing
    if (isSharing && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => {
            pc.addTrack(track, videoElement.srcObject);
        });
    }
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: clientId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            pc.close();
            peerConnections.delete(clientId);
            updateClientsList();
        }
    };
    
    // Create offer
    pc.createOffer()
        .then(offer => {
            pc.setLocalDescription(offer);
            socket.emit('offer', {
                to: clientId,
                offer: offer
            });
        })
        .catch(e => console.error('Failed to create offer:', e));
}

/**
 * Start screen sharing
 */
async function startSharing() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always'
            },
            audio: false
        });
        
        videoElement.srcObject = stream;
        isSharing = true;
        
        // Update UI
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        
        // Add stream to existing peer connections
        stream.getTracks().forEach(track => {
            peerConnections.forEach((pc, clientId) => {
                const sender = pc.getSenders().find(s => s.track?.kind === track.kind);
                if (sender) {
                    sender.replaceTrack(track);
                } else {
                    pc.addTrack(track, stream);
                }
            });
        });
        
        // Handle stream end (user stops screen share)
        stream.getTracks().forEach(track => {
            track.onended = stopSharing;
        });
        
        console.log('✓ Screen sharing started');
    } catch (e) {
        if (e.name !== 'NotAllowedError') {
            console.error('Failed to start sharing:', e);
            alert('Failed to start sharing: ' + e.message);
        }
    }
}

/**
 * Stop screen sharing
 */
function stopSharing() {
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
    }
    
    isSharing = false;
    
    // Update UI
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    
    console.log('✓ Screen sharing stopped');
}

/**
 * Update connection status display
 */
function updateConnectionStatus(connected) {
    if (connected) {
        statusDot.classList.remove('offline');
        connectionStatus.textContent = 'Connected to server';
    } else {
        statusDot.classList.add('offline');
        connectionStatus.textContent = 'Disconnected from server';
    }
}

/**
 * Update clients list display
 */
function updateClientsList() {
    const count = peerConnections.size;
    clientCount.textContent = count + (count === 1 ? ' client' : ' clients');
    
    if (count === 0) {
        clientsList.innerHTML = 'No clients connected';
        return;
    }
    
    let html = '';
    peerConnections.forEach((pc, clientId) => {
        html += `<div style="padding: 0.5rem; border-bottom: 1px solid rgba(148, 163, 184, 0.1);">
            <div style="font-weight: 500; font-size: 0.75rem; color: #e2e8f0;">${clientId.substring(0, 8)}</div>
            <div style="font-size: 0.75rem; color: #94a3b8;">${pc.connectionState}</div>
        </div>`;
    });
    clientsList.innerHTML = html;
}

/**
 * Copy share link to clipboard
 */
function copyShareLink() {
    const link = shareLink.textContent;
    navigator.clipboard.writeText(link)
        .then(() => alert('Share link copied!'))
        .catch(() => alert('Failed to copy link'));
}

/**
 * Return to home page
 */
function goHome() {
    stopSharing();
    peerConnections.forEach(pc => pc.close());
    socket.disconnect();
    window.location.href = '/';
}

// Try to connect to local control service
fetch('http://localhost:9001').catch(() => {
    console.log('Note: Host control service not running. Remote control disabled.');
    console.log('To enable mouse/keyboard control, run: node public/host-control-service.js');
});
