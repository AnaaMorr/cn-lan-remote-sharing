# LAN Remote Desktop System

A professional **WebRTC-based remote desktop application** with screen sharing and remote mouse/keyboard control for local network environments.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SignalingSServer (Render/Cloud)          │
│  - Room management                                          │
│  - WebRTC signaling (offer/answer/ICE)                     │
│  - Socket.IO connection relay                              │
└──────────────┬──────────────────────────────────┬──────────┘
               │                                   │
        (Signaling only)                   (Signaling only)
               │                                   │
    ┌──────────▼─────────┐             ┌─────────▼──────────┐
    │   HOST MACHINE     │             │   CLIENT MACHINE   │
    │  (Screen Sharer)   │◄──WebRTC───►│  (Remote Viewer)   │
    │                    │  (P2P Media)│                    │
    │ ┌────────────────┐ │             │ ┌────────────────┐ │
    │ │ Screen Capture │ │             │ │ Video Display  │ │
    │ │ (getDisplay)   │ │             │ │ & Input Capture│ │
    │ └────────┬───────┘ │             │ └────────┬───────┘ │
    │          │         │             │          │         │
    │          └─────────┼─────────────┼──────────┘         │
    │                    │             │                    │
    │ ┌────────────────┐ │             │ ┌────────────────┐ │
    │ │Server Process  │ │   Mouse/   │ │Client Browser  │ │
    │ │(Listen:3000)   │ │  Keyboard  │ │(Port:Any)      │ │
    │ └────────────────┘ │   Events   │ └────────────────┘ │
    │          ▲         │             │          │         │
    │          │         │             │          │         │
    │ ┌────────▼───────┐ │             │          │         │
    │ │robotjs Service │ │             │          │         │
    │ │(localhost:9001)│ │             │          │         │
    │ │- moveMouse     │ │             │          │         │
    │ │- mouseClick    │ │             │          │         │
    │ │- keyTap        │ │             │          │         │
    │ │- typeString    │ │             │          │         │
    │ └────────────────┘ │             │          │         │
    └────────────────────┘             └────────────────────┘
```

## Components

### 1. **Signaling Server** (`server.js`)
- **Framework**: Express + Socket.IO
- **Responsibilities**:
  - Room creation and management
  - WebRTC signal relay (offer/answer/ICE candidates)
  - Control message routing
  - Deployment-safe (no robotjs dependency)
- **Deployment**: Render, Heroku, AWS, or any Node.js cloud
- **Port**: 3000 (configurable via `PORT` env var)

### 2. **Host Control Service** (`host-control-service.js`)
- **Purpose**: Local mouse/keyboard control via robotjs
- **Runs independently**: On the host machine only
- **Port**: 9001 (localhost only)
- **Installation**: `npm install robotjs` (optional, local only)
- **Commands supported**:
  - `mouse-move`: Move cursor to (x, y)
  - `mouse-click`: Left/right/middle click
  - `mouse-scroll`: Scroll wheel
  - `key-tap`: Type character
  - `key-press`: Press key with modifiers

### 3. **Host Client** (`room-host.html` + `room-host.js`)
- **Runs in**: Browser on host machine
- **Features**:
  - Screen capture via `getDisplayMedia()`
  - WebRTC peer connection to clients
  - Client management dashboard
  - Start/stop sharing controls
  - Room link sharing
- **Control Flow**:
  1. User clicks "Start Sharing"
  2. Browser requests screen capture
  3. Screen stream added to WebRTC peer
  4. Clients connect and receive stream

### 4. **Remote Client** (`room-client.html` + `room-client.js`)
- **Runs in**: Browser on client machine
- **Features**:
  - Receives screen stream from host
  - Mouse movement capture
  - Mouse click sending (left/right/double)
  - Keyboard input capture
  - Scroll wheel support
  - Remote cursor visualization
  - Latency measurement
- **Control Flow**:
  1. User moves mouse → normalized (0-1)
  2. Socket sends control message to signaling server
  3. Server routes to host via socket
  4. Host forwards to robotjs service
  5. Robotjs executes on host OS

## Installation & Setup

### Prerequisites
- **Node.js 18+** (for cloud deployment compatibility)
- **Modern browsers** with WebRTC support (Chrome, Firefox, Edge, Safari)
- **Internet connection** for Render/cloud signaling server

### Local Development

```bash
# Install dependencies
npm install

# Start signaling server
npm start
# Server runs on http://localhost:3000

# In another terminal, start host control service (optional)
npm run control-service
# Service listens on localhost:9001
```

### Cloud Deployment (Render)

1. **Create Render account** and new Web Service
2. **Connect repository** containing this project
3. **Build command**: `npm install`
4. **Start command**: `npm start`
5. **Environment**: Node (auto-selected)
6. **Port**: 3000 (auto-configured)

**Key advantage**: robotjs is NOT deployed to cloud (optional dependency). Signaling server runs without it.

### Using `.gitignore`

The project includes `.gitignore` to prevent:
- `node_modules/` (reinstalled on deployment)
- `robotjs/` (optional local-only compilation)
- `.env` and local config files

## Usage

### 1. Start Server

```bash
node server.js
# Output shows accessible IPs
```

### 2. Host Starts Session

- Open `http://localhost:3000` (or any accessible IP)
- Click "🎤 Host Session"
- Click "▶ Start Sharing"
- Share the link shown in sidebar: `http://<host-ip>:3000/room-client.html?room=ABCD1234`

### 3. Client Joins Session

- Open link or manually go to `/room-client.html?room=ABCD1234`
- Control the remote screen:
  - **Mouse Movement**: Move any mouse over video
  - **Click**: Regular/right/double click
  - **Scroll**: Mouse wheel
  - **Type**: Keyboard input (including copy/paste)

### 4. Host Control (Optional)

To enable remote mouse/keyboard execution:

```bash
# On host machine
npm install robotjs
npm run control-service
# Service listens on port 9001
```

Client will automatically detect and use the service when available.

## Architecture Decisions

### 1. **Signaling-Only Server**
- Server **never touches robotjs** → safe for cloud deployment
- Only relays WebRTC signals and control messages
- Stateless (no persistent connections to host data)

### 2. **localhost:9001 Control Service**
- Runs only on host machine locally
- Isolated from cloud infrastructure
- robotjs compilation only happens locally
- Can be disabled without breaking screen sharing

### 3. **WebRTC Data Channels**
- Control messages sent via Socket.IO signaling
- Server routes to host in real-time
- Low latency for interactive control
- Secure within local network

### 4. **Room-Based Sessions**
- Unique room IDs (UUID-based)
- Multiple clients can join same room
- Rooms auto-delete after 5 minutes if empty
- Better than hardcoded connections

## Configuration

### Environment Variables

```bash
PORT=3000              # Signaling server port (default 3000)
NODE_ENV=production    # For cloud deployment
```

### Browser Permissions

Users must grant:
- **Screen Sharing Permission**: For host machine
- **Microphone/Camera**: Optional (not used, can decline)

## Performance & Latency

- **Network RTT**: 1-50ms (local network)
- **Key press to command**: <100ms typical
- **Screen stream latency**: 50-200ms (WebRTC adaptive)
- **Latency indicator**: Real-time in client header

## Security Considerations

⚠️ **WARNING**: This system is designed for **trusted local networks only**.

### Risks

- No authentication/encryption for room access
- Send plaintext room IDs
- No encryption on WebRTC (SRTP enabled by default, but depend on browser)

### For Production

- Add authentication (JWT/OAuth)
- Use TLS/HTTPS (required for `getDisplayMedia()` on HTTPS)
- Implement room password protection
- Add audit logging
- Use VPN for remote access

## Troubleshooting

### Server fails: "Cannot find module 'uuid'"
```bash
npm install uuid
```

### Screen capture fails with "Permission Denied"
- HTTPS required: Use `https://` when deployed (Render provides this)
- User must allow screen sharing in browser prompt

### Remote control not working
- Check if `host-control-service.js` is running
- Verify `robotjs` is installed: `npm install robotjs`
- Check firewall not blocking localhost:9001

### High latency or stuttering
- Check network bandwidth and stability
- Reduce screen resolution if needed
- Close other bandwidth-intensive apps
- Try wired connection instead of WiFi

## File Structure

```
public/
├── index.html                 # Home page (role selection)
├── room-host.html             # Host interface
├── room-client.html           # Client interface
├── room-host.js               # Host WebRTC logic
├── room-client.js             # Client WebRTC logic
├── host-control-service.js    # Local robotjs service
├── style.css                  # Tailwind-based styling
└── [deprecated]
    ├── client.html            # Old design (replaced)
    ├── host.html              # Old design (replaced)
    └── ...

server.js                       # Signaling server
package.json                    # Dependencies
.gitignore                      # Git exclusions
```

## Future Enhancements

- [ ] Clipboard sync (copy/paste between devices)
- [ ] File transfer
- [ ] Audio passthrough
- [ ] Multiple monitor support
- [ ] Session recording
- [ ] Performance metrics dashboard
- [ ] Mobile client support
- [ ] End-to-end encryption

## Technologies Used

- **Frontend**: HTML5, CSS (Tailwind), JavaScript (ES6+)
- **Backend**: Node.js, Express, Socket.IO
- **WebRTC**: Native browser APIs
- **Control**: robotjs (local only)
- **Deployment**: Render, cloud-friendly architecture

## License

MIT

## Support

For issues, refer to:
- WebRTC debugging: Open DevTools → Network tab
- Check server logs: `node server.js` output
- Control service logs: Run `npm run control-service` in terminal
