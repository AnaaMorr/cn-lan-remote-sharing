/**
 * Client - Room-based Remote Control
 * 
 * Handles:
 * - Connecting to host via WebRTC
 * - Receiving screen stream from host
 * - Capturing and sending mouse/keyboard events
 * - Managing connection latency
 */

const socket = io();
const roomId = new URLSearchParams(window.location.search).get('room');
let pc = null;
let hostId = null;
let isConnected = false;
let lastMessageTime = 0;

// UI elements
const videoElement = document.getElementById('remoteVideo');
const videoContainer = document.getElementById('videoContainer');
const remoteCursor = document.getElementById('remoteCursor');
const roomDisplay = document.getElementById('roomDisplay');
const connectionBadge = document.getElementById('connectionBadge');
const latencyDisplay = document.getElementById('latency');

// Set room display
roomDisplay.textContent = `Room: ${roomId}`;

// Join room
socket.emit('client-join', { roomId }, (response) => {
    if (response.success) {
        console.log('✓ Joined room:', roomId);
        hostId = response.hostId;
        createPeerConnection();
    } else {
        alert('Failed to join room: ' + response.error);
        goHome();
    }
});

// Receive offer from host
socket.on('offer', ({ from, offer }) => {
    if (!pc) {
        createPeerConnection();
    }
    
    pc.setRemoteDescription(new RTCSessionDescription(offer))
        .then(() => pc.createAnswer())
        .then(answer => {
            pc.setLocalDescription(answer);
            socket.emit('answer', {
                to: from,
                answer: answer
            });
        })
        .catch(e => console.error('Failed to handle offer:', e));
});

// Receive ICE candidates
socket.on('ice-candidate', ({ from, candidate }) => {
    if (pc && candidate) {
        pc.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(e => console.error('Failed to add ICE candidate:', e));
    }
});

// Handle disconnection
socket.on('disconnect', () => {
    updateConnectionStatus(false);
});

/**
 * Create WebRTC peer connection
 */
function createPeerConnection() {
    console.log('Creating peer connection');
    
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: ['stun:stun.l.google.com:19302'] },
            { urls: ['stun:stun1.l.google.com:19302'] }
        ]
    });
    
    // Handle incoming stream (screen from host)
    pc.ontrack = (event) => {
        console.log('Received remote stream:', event.track.kind);
        if (event.streams && event.streams[0]) {
            videoElement.srcObject = event.streams[0];
        }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate', {
                to: hostId,
                candidate: event.candidate
            });
        }
    };
    
    // Handle connection state
    pc.onconnectionstatechange = () => {
        console.log('Connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
            updateConnectionStatus(true);
            setupControlInput();
            startLatencyTest();
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            updateConnectionStatus(false);
        }
    };
}

/**
 * Set up mouse and keyboard input handling
 */
function setupControlInput() {
    // Mouse move
    videoContainer.addEventListener('mousemove', (e) => {
        if (!isConnected) return;
        
        const rect = videoContainer.getBoundingClientRect();
        const x = Math.round((e.clientX - rect.left) / rect.width * 65535);
        const y = Math.round((e.clientY - rect.top) / rect.height * 65535);
        
        // Update remote cursor (visual feedback)
        remoteCursor.style.left = (e.clientX - rect.left - 10) + 'px';
        remoteCursor.style.top = (e.clientY - rect.top - 10) + 'px';
        remoteCursor.classList.remove('hidden');
        
        // Send movement (throttled)
        if (Date.now() - lastMessageTime > 16) { // ~60fps
            sendControlMessage('mouse-move', { x, y });
            lastMessageTime = Date.now();
        }
    });
    
    // Mouse leave
    videoContainer.addEventListener('mouseleave', () => {
        remoteCursor.classList.add('hidden');
    });
    
    // Mouse clicks
    videoContainer.addEventListener('mousedown', (e) => {
        if (!isConnected) return;
        e.preventDefault();
        
        const buttons = { 0: 'left', 2: 'right', 1: 'middle' };
        const button = buttons[e.button] || 'left';
        
        sendControlMessage('mouse-click', { button, double: false });
    });
    
    // Double click
    videoContainer.addEventListener('dblclick', (e) => {
        if (!isConnected) return;
        e.preventDefault();
        sendControlMessage('mouse-click', { button: 'left', double: true });
    });
    
    // Scroll
    videoContainer.addEventListener('wheel', (e) => {
        if (!isConnected) return;
        e.preventDefault();
        
        const x = e.deltaX > 0 ? 1 : e.deltaX < 0 ? -1 : 0;
        const y = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
        
        sendControlMessage('mouse-scroll', { x, y });
    });
    
    // Keyboard input
    document.addEventListener('keydown', (e) => {
        if (!isConnected || !shouldCapture(e)) return;
        e.preventDefault();
        
        const key = e.key.toLowerCase();
        const modifiers = [];
        if (e.ctrlKey) modifiers.push('ctrl');
        if (e.altKey) modifiers.push('alt');
        if (e.shiftKey) modifiers.push('shift');
        if (e.metaKey) modifiers.push('cmd');
        
        sendControlMessage('key-press', { key, modifiers });
    });
    
    // Text input (for typing)
    document.addEventListener('keypress', (e) => {
        if (!isConnected || !shouldCapture(e)) return;
        
        sendControlMessage('key-tap', { text: e.key });
    });
    
    console.log('✓ Control input ready');
}

/**
 * Determine if key should be captured
 */
function shouldCapture(e) {
    // Don't capture F12 (dev tools) or browser shortcuts
    if (e.key === 'F12' || (e.ctrlKey && ['s', 'w', 'q'].includes(e.key.toLowerCase()))) {
        return false;
    }
    return true;
}

/**
 * Send control message to host via signaling channel
 */
function sendControlMessage(type, data) {
    socket.emit('control-message', {
        roomId: roomId,
        type: type,
        data: data
    });
}

/**
 * Measure latency periodically
 */
function startLatencyTest() {
    setInterval(() => {
        if (!isConnected) return;
        
        const startTime = Date.now();
        socket.emit('ping', {}, () => {
            const latency = Date.now() - startTime;
            latencyDisplay.textContent = latency + ' ms';
            
            // Color code: green < 50ms, yellow < 100ms, red >= 100ms
            if (latency < 50) {
                latencyDisplay.style.color = '#10b981';
            } else if (latency < 100) {
                latencyDisplay.style.color = '#fbbf24';
            } else {
                latencyDisplay.style.color = '#ef4444';
            }
        });
    }, 1000); // Test every second
}

/**
 * Update connection status
 */
function updateConnectionStatus(connected) {
    isConnected = connected;
    
    if (connected) {
        connectionBadge.classList.remove('badge-danger');
        connectionBadge.classList.add('badge-success');
        connectionBadge.textContent = 'Connected';
    } else {
        connectionBadge.classList.remove('badge-success');
        connectionBadge.classList.add('badge-danger');
        connectionBadge.textContent = 'Disconnected';
    }
}

/**
 * Disconnect and return home
 */
function disconnect() {
    if (pc) pc.close();
    socket.disconnect();
    goHome();
}

/**
 * Return to home page
 */
function goHome() {
    window.location.href = '/';
}

// Prevent context menu on video (use right-click for control)
videoContainer.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isConnected) {
        sendControlMessage('mouse-click', { button: 'right', double: false });
    }
});
