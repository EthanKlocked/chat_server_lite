import { Socket } from 'socket.io';

export interface ChatMessage {
    id: string;
    senderId: string;
    content: string;
    timestamp: Date;
    readBy: string[]; 
}

export interface Payload {
    email: string;
    id: string;
}

export interface AuthenticatedSocket extends Socket {
	user: Payload 
}