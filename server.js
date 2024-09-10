const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

const waitingUsers = new Map(); // Map of users waiting to be matched, grouped by interests
const noInterestUsers = []; // Array of users with no selected interests

function findMatch(socket) {
  if (!socket.interests || socket.interests.length === 0) {
    // Match only with another user with no interests
    if (noInterestUsers.length > 0) {
      const partner = noInterestUsers.shift();
      connectUsers(socket, partner);
      return true;
    }
  } else {
    // Try to match based on any shared interests
    for (let interest of socket.interests) {
      if (waitingUsers.has(interest) && waitingUsers.get(interest).length > 0) {
        const partner = waitingUsers.get(interest).find((user) => user !== socket);
        if (partner) {
          // Remove both users from all relevant interest lists
          removeFromWaitingList(socket);
          removeFromWaitingList(partner);
          
          connectUsers(socket, partner);
          return true;
        }
      }
    }
  }
  return false;
}


function connectUsers(user1, user2) {
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
  if (!socket.interests || socket.interests.length === 0) {
    const index = noInterestUsers.indexOf(socket);
    if (index > -1) {
      noInterestUsers.splice(index, 1);
    }
  } else {
    socket.interests.forEach(interest => {
      if (waitingUsers.has(interest)) {
        const index = waitingUsers.get(interest).indexOf(socket);
        if (index > -1) {
          waitingUsers.get(interest).splice(index, 1);
        }
      }
    });
  }
}


io.on('connection', (socket) => {
  console.log('New user connected');
  
  // Initialize interests as an empty array
  socket.interests = [];

  socket.on('set interests', (interests) => {
    socket.interests = interests;
    findMatch(socket) || addToWaitingList(socket);
  });

  socket.on('send message', (message) => {
    if (socket.partner) {
      socket.partner.emit('receive message', message);
    }
  });

  socket.on('disconnect partner', () => {
    if (socket.partner) {
      socket.partner.emit('partner disconnected');
      socket.partner.partner = null;
      socket.partner = null;
    }
    removeFromWaitingList(socket);
    findMatch(socket) || addToWaitingList(socket);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    if (socket.partner) {
      socket.partner.emit('partner disconnected');
      socket.partner.partner = null;
    }
    removeFromWaitingList(socket);
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));