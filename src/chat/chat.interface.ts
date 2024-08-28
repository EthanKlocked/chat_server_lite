import { Socket } from 'socket.io';
import { MessageType } from '@src/chat/dto/chat.send.dto';


export interface ChatMessage {
    id: string;
    senderId: string;
    type:MessageType;
    content: string[];
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