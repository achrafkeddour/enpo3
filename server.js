const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads with increased limits
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

let users = {};

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('join', (username) => {
        users[username] = socket.id;
        socket.username = username;
        console.log(`${username} joined the chat`);
        io.emit('updateUserList', Object.keys(users));
    });

    socket.on('private message', ({ recipient, message, imageUrl }) => {
        if (users[recipient]) {
            io.to(users[recipient]).emit('private message', {
                sender: socket.username,
                message,
                imageUrl
            });
        }
    });

    socket.on('typing', ({ recipient }) => {
        if (users[recipient]) {
            io.to(users[recipient]).emit('typing', { sender: socket.username });
        }
    });

    socket.on('stop typing', ({ recipient }) => {
        if (users[recipient]) {
            io.to(users[recipient]).emit('stop typing', { sender: socket.username });
        }
    });

    // Audio call signaling events
    socket.on('call user', ({ recipient, offer }) => {
        console.log(`${socket.username} is calling ${recipient}`);
        if (users[recipient]) {
            io.to(users[recipient]).emit('incoming call', {
                caller: socket.username,
                offer: offer
            });
        }
    });

    socket.on('answer call', ({ recipient, answer }) => {
        console.log(`${socket.username} answered call from ${recipient}`);
        if (users[recipient]) {
            io.to(users[recipient]).emit('call accepted', {
                answer: answer
            });
        }
    });

    socket.on('webrtc signal', ({ recipient, signal }) => {
        console.log(`${socket.username} sent a WebRTC signal to ${recipient}`);
        if (users[recipient]) {
            io.to(users[recipient]).emit('webrtc signal', {
                signal: signal,
                sender: socket.username
            });
        }
    });

    socket.on('end call', ({ recipient }) => {
        console.log(`${socket.username} ended the call with ${recipient}`);
        if (users[recipient]) {
            io.to(users[recipient]).emit('call ended', {
                caller: socket.username
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`${socket.username} disconnected`);
        delete users[socket.username];
        io.emit('updateUserList', Object.keys(users));
    });
});

// Endpoint for image upload
app.post('/upload', upload.single('image'), (req, res) => {
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// Additional logging and error handling
server.on('error', (err) => {
    console.error('Server error:', err);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Extra utility: log active users every minute
function logActiveUsers() {
    console.log('Active Users:', Object.keys(users));
}
setInterval(logActiveUsers, 60000);
