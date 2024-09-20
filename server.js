const express = require('express');
const https = require('https');
const fs = require('fs');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

const server = https.createServer(options, app);

let onlineUsers = new Set();

const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://192.168.1.2:5000",
        "http://43.204.130.30:9922",
        "http://43.204.130.30",
        "https://kishmish-ui.vercel.app",
        "http://localhost:3000"
      ];

      if (1 < 2) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Hello, welcome to the Node.js app!');
});

const waitingUsers = new Map();
const noInterestUsers = [];

function findMatch(socket) {
  // If the user has no interests
  if (!socket.interests || socket.interests.length === 0) {
    // Match only with another user with no interests
    if (noInterestUsers.length > 0) {
      const partner = noInterestUsers.find(user => user !== socket);
      if (partner) {
        // Remove the partner from the list and connect
        // noInterestUsers = noInterestUsers.filter(user => user !== partner);
        connectUsers(socket, partner);
        return true;
      }
    }
  } else {
    // Try to match based on shared interests
    for (let interest of socket.interests) {
      if (waitingUsers.has(interest) && waitingUsers.get(interest).length > 0) {
        const partner = waitingUsers.get(interest).find(user => user !== socket);
        if (partner) {
          // Remove the partner from the list and connect
          // waitingUsers.set(interest, waitingUsers.get(interest).filter(user => user !== partner));
          connectUsers(socket, partner);
          return true;
        }
      }
    }
  }
  return false;
}



function connectUsers(user1, user2) {
  removeFromWaitingList(user1);
  removeFromWaitingList(user2);
  user1.partner = user2;
  user2.partner = user1;
  user1.emit('chat start', user2.id);
  user2.emit('chat start', user1.id);

  console.log(`${user1.id} connected to ${user2.id}`);
}

function addToWaitingList(socket) {
  if (!socket.interests || socket.interests.length === 0) {
    noInterestUsers.push(socket);
  } else {
    socket.interests.forEach(interest => {
      if (!waitingUsers.has(interest)) {
        waitingUsers.set(interest, []);
      }
      waitingUsers.get(interest).push(socket);
    });
  }
  socket.emit('waiting');
}

function removeFromWaitingList(socket) {
  if (socket) {
    if (!socket.interests || socket.interests.length === 0) {
      const index = noInterestUsers.indexOf(socket);
      if (index > -1) {
        noInterestUsers.splice(index, 1);
      }
    } else {
      socket.interests.forEach(interest => {
        if (waitingUsers.has(interest)) {
          waitingUsers.set(interest, waitingUsers.get(interest).filter(user => user !== socket));
          if (waitingUsers.get(interest).length === 0) {
            waitingUsers.delete(interest);
          }
        }
      });
    }
  }
}

function disconnectPartner(socket) {
  if (socket.partner) {
    socket.partner.emit('partner disconnected');
    socket.partner.partner = null;
    socket.partner = null;
  }
}


function initializeVoiceCall(socket) {
  socket.on('voice-call-request', () => {
    if (socket.partner) {
      const callId = uuidv4();
      socket.partner.emit('voice-call-incoming', { callId });
      socket.emit('voice-call-outgoing', { callId });
    }
  });

  socket.on('voice-call-accepted', ({ callId }) => {
    if (socket.partner) {
      socket.partner.emit('voice-call-connected', { callId });
      socket.emit('voice-call-connected', { callId });
    }
  });

  socket.on('voice-call-rejected', () => {
    if (socket.partner) {
      socket.partner.emit('voice-call-ended');
    }
  });

  socket.on('voice-call-ended', () => {
    if (socket.partner) {
      socket.partner.emit('voice-call-ended');
    }
  });

  socket.on('ice-candidate', (candidate) => {
    if (socket.partner) {
      socket.partner.emit('ice-candidate', candidate);
    }
  });

  socket.on('offer', (offer) => {
    if (socket.partner) {
      socket.partner.emit('offer', offer);
    }
  });

  socket.on('answer', (answer) => {
    if (socket.partner) {
      socket.partner.emit('answer', answer);
    }
  });
}

io.on('connection', (socket) => {
  console.log(`New user connected ${socket.id}`);
  onlineUsers.add(socket.id);

  io.emit('totalUsersCount', onlineUsers.size);
  
  socket.interests = [];

  initializeVoiceCall(socket);

  socket.on('set interests', (interests) => {
    removeFromWaitingList(socket);
    socket.interests = interests;
    findMatch(socket) || addToWaitingList(socket);
  });

  socket.on('send message', (message) => {
    if (socket.partner) {
      socket.partner.emit('receive message', message);
    }
  });

  socket.on('disconnect partner', () => {
    removeFromWaitingList(socket);
    disconnectPartner(socket);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    removeFromWaitingList(socket);
    disconnectPartner(socket);

    onlineUsers.delete(socket.id);
    io.emit('totalUsersCount', onlineUsers.size);
  });
});

const PORT = process.env.PORT || 4000;
// const PORT = process.env.PORT || 3000;
// server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on https://0.0.0.0:${PORT}`);
});