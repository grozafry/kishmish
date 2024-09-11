const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // List of allowed origins
      const allowedOrigins = [
        "http://43.204.130.30:3000",
        "https://kishmish-ui.vercel.app",
        "http://localhost:3000"
      ];

      if (allowedOrigins.includes(origin) || !origin) {
        // Allow requests with no origin (e.g., Postman or server-to-server requests)
        callback(null, true);
      } else {
        // Reject requests from non-allowed origins
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.send('Hello, welcome to the Node.js app!');
});

const waitingUsers = new Map(); // Map of users waiting to be matched, grouped by interests
const noInterestUsers = []; // Array of users with no selected interests

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

io.on('connection', (socket) => {
  console.log(`New user connected ${socket.id}`);
  
  socket.interests = [];

  socket.on('set interests', (interests) => {
    removeFromWaitingList(socket); // Remove from any previous waiting lists
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
    // Removed: findMatch(socket) || addToWaitingList(socket);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    removeFromWaitingList(socket);
    disconnectPartner(socket);
  });
});

const PORT = process.env.PORT || 4000;
// const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));