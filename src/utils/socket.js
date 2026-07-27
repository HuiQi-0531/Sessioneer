import { io } from 'socket.io-client';
import { API_URL } from '../config/api';

let socket;

export const getSocket = () => {
  const token = localStorage.getItem('token');

  if (!token) {
    return null;
  }

  if (!socket) {
    socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling']
    });
  }

  if (!socket.connected) {
    socket.auth = { token };
    socket.connect();
  }

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
