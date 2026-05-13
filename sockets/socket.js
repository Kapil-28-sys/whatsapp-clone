// sockets/socket.js
const { Server } = require("socket.io");

let io;

// phone → Set of socketIds (BEST approach instead of count)
const onlineUsers = new Map();
const lastSeenMap = {};

const getPhoneRooms = (phone) => {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  const last10 = digits.length > 10 ? digits.slice(-10) : digits;

  return Array.from(new Set([raw, digits, last10].filter(Boolean)));
};

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 5000,
    pingInterval: 10000,
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // ================= CHAT ROOM =================
    socket.on("joinChat", (chatId) => {
      socket.join(chatId);
    });

    // ================= USER ONLINE =================
    socket.on("joinUserRoom", (userPhone) => {
      if (!userPhone) return;

      // ❌ prevent duplicate join from same socket
      if (socket.userPhone === userPhone) return;

      socket.userPhone = userPhone;
      getPhoneRooms(userPhone).forEach(room => socket.join(room));

      let userSockets = onlineUsers.get(userPhone);

      if (!userSockets) {
        userSockets = new Set();
        onlineUsers.set(userPhone, userSockets);
      }

      userSockets.add(socket.id);

      delete lastSeenMap[userPhone];

      emitPresence();
    });

    // ================= USER LEAVE =================
    socket.on("leaveUserRoom", (userPhone) => {
      if (!userPhone) return;

      const userSockets = onlineUsers.get(userPhone);
      if (!userSockets) return;

      getPhoneRooms(userPhone).forEach(room => socket.leave(room));
      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userPhone);
        lastSeenMap[userPhone] = new Date().toISOString();
      }

      emitPresence();
    });

    // ================= DISCONNECT =================
    socket.on("disconnect", () => {
      const userPhone = socket.userPhone;
      if (!userPhone) return;

      const userSockets = onlineUsers.get(userPhone);
      if (!userSockets) return;

      userSockets.delete(socket.id);

      if (userSockets.size === 0) {
        onlineUsers.delete(userPhone);
        lastSeenMap[userPhone] = new Date().toISOString();
      }

      emitPresence();
    });

    // ================= OTHER EVENTS =================
    socket.on("typing", ({ chatId, user }) => {
      socket.to(chatId).emit("userTyping", { chatId, user });
    });

    socket.on("markRead", ({ chatId }) => {
      socket.to(chatId).emit("messagesSeen", { chatId });
    });

    // ================= CALL SIGNALING =================
    socket.on("call:offer", ({ to, from, fromName, chatId, offer, callType }) => {
      if (!to || !from || !offer) return;

      console.log("[call:offer]", {
        from,
        to,
        chatId,
        recipientSockets: onlineUsers.get(to)?.size || 0,
      });

      io.to(getPhoneRooms(to)).emit("call:incoming", {
        from,
        fromName,
        chatId,
        offer,
        callType: callType || "audio",
      });
    });

    socket.on("call:answer", ({ to, from, chatId, answer }) => {
      if (!to || !from || !answer) return;

      console.log("[call:answer]", {
        from,
        to,
        chatId,
        recipientSockets: onlineUsers.get(to)?.size || 0,
      });

      io.to(getPhoneRooms(to)).emit("call:answered", {
        from,
        chatId,
        answer,
      });
    });

    socket.on("call:ice-candidate", ({ to, from, chatId, candidate }) => {
      if (!to || !from || !candidate) return;

      console.log("[call:ice-candidate]", {
        from,
        to,
        chatId,
        type: candidate.type,
        protocol: candidate.protocol,
        recipientSockets: onlineUsers.get(to)?.size || 0,
      });

      io.to(getPhoneRooms(to)).emit("call:ice-candidate", {
        from,
        chatId,
        candidate,
      });
    });

    socket.on("call:reject", ({ to, from, chatId, reason }) => {
      if (!to || !from) return;

      io.to(getPhoneRooms(to)).emit("call:rejected", {
        from,
        chatId,
        reason: reason || "rejected",
      });
    });

    socket.on("call:busy", ({ to, from, chatId }) => {
      if (!to || !from) return;

      io.to(getPhoneRooms(to)).emit("call:busy", {
        from,
        chatId,
      });
    });

    socket.on("call:end", ({ to, from, chatId, reason }) => {
      if (!to || !from) return;

      io.to(getPhoneRooms(to)).emit("call:ended", {
        from,
        chatId,
        reason: reason || "ended",
      });
    });

    socket.on("chatDeleted", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatDeleted", { chatId, userPhone });
    });

    socket.on("chatDeletedPermanently", ({ chatId }) => {
      io.to(chatId).emit("chatDeletedPermanently", { chatId });
    });

    socket.on("pinChat", ({ chatId, userPhone, pinned }) => {
      io.to(userPhone).emit("chatPinned", { chatId, pinned });
    });

    socket.on("clearChat", ({ chatId, userPhone }) => {
      io.to(userPhone).emit("chatCleared", { chatId });
    });
  });

  // ================= EMIT PRESENCE =================
const emitPresence = () => {
  // ✅ clean stale lastSeen for any user who is currently online
  onlineUsers.forEach((_, phone) => { delete lastSeenMap[phone]; });
  
  io.emit("onlineUsers", {
    users: Array.from(onlineUsers.keys()),
    lastSeen: lastSeenMap,
  });
};
  return io;
};

const getIO = () => {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
};

module.exports = { initSocket, getIO };
