import {
	WebSocketGateway,
	SubscribeMessage,
	MessageBody,
	ConnectedSocket,
	WebSocketServer,
	OnGatewayConnection,
	OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ChatService } from '@src/chat/chat.service';
import { AuthenticatedSocket } from '@src/chat/chat.interface';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenExpiredError } from 'jsonwebtoken';

@WebSocketGateway({
	cors: {
		origin: '*', // Need to be set as client domain in service level
		pingTimeout: 6000000, //100 minutes
	},	
})

export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
	@WebSocketServer() server: Server;

	constructor(
		private configService: ConfigService,
		private chatService: ChatService,
		private jwtService: JwtService,
	) {}

	async handleConnection(client: AuthenticatedSocket) {
		try {
			//check token
			const tokenHeader = client.handshake.headers.token;
			const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
			const payload = await this.jwtService.verifyAsync(token);
			client.user = payload;
			const userId = payload.id
			//join to server
			await client.join(`user:${userId}`);
			client.emit('status', `user:${userId} connected`);
			//update chat list
			const chatList = await this.chatService.getChatList(userId);
			const filteredChat = chatList.filter(chat => chat.available);
			for (const chat of filteredChat) await client.join(chat.roomId);
			client.emit('status', 'chat list updated');
			client.emit('chatList', filteredChat)
		} catch (error) {
			if (error instanceof TokenExpiredError) client.emit('error', 'token expired');
			client.emit('error', 'connection failed');
			client.disconnect();
		}
	}

	handleDisconnect(client: AuthenticatedSocket) {
		const userId = client.user?.id
		client.emit('status', 'disconnected');
	}

	@SubscribeMessage('initializeChat')
	async handleInitializeChat(
		@ConnectedSocket() client: AuthenticatedSocket,
		@MessageBody() data: { participants: string[] }
	) {
		//setting
		const userId = client.user.id;
        const { participants } = data;
        const memberSet = Array.from(new Set([userId, ...participants]));
		const roomId = await this.chatService.initializeChat(memberSet);
		//control members (multi devices)
        await Promise.all(memberSet.map(async (memberId) => {
			//join all devices
            const sockets = await this.server.in(`user:${memberId}`).allSockets();
            const joinPromises = Array.from(sockets).map(socketId =>
                this.server.sockets.sockets.get(socketId).join(roomId)
            );
            await Promise.all(joinPromises);
			//update chat list
			const chatList = await this.chatService.getChatList(memberId);
            const filteredChat = chatList.filter(chat => chat.available);
            this.server.to(`user:${memberId}`).emit('chatList', filteredChat);
        }));
		client.emit('status', `${roomId} initialized`);
	}

	@SubscribeMessage('getChatList')
	async handleGetChatList(@ConnectedSocket() client: AuthenticatedSocket) {
		const userId = client.user.id;
		const chatList = await this.chatService.getChatList(userId);
		const filteredChat = chatList.filter(chat => chat.available);
		client.emit('chatList', filteredChat);
	}

	@SubscribeMessage('enterChat')
	async handleEnterChat(
		@ConnectedSocket() client: AuthenticatedSocket,
		@MessageBody() data: { roomId: string }
	) {
		//user check
		const userId = client.user.id;
		const { roomId } = data
		const isAvailable = await this.chatService.isChatMember(userId, roomId);
		if (isAvailable) {
			//mark all messages in chat
			await this.chatService.markMessageAsRead(roomId, userId);
			//get chat history for only current device
			const chatHistory = await this.chatService.getMessages(roomId);			
			client.emit('chatHistory', chatHistory);
			//chat list update for multi connection
			const chatList = await this.chatService.getChatList(userId);
			const filteredChat = chatList.filter(chat => chat.available);			
			this.server.to(`user:${userId}`).emit('chatList', filteredChat);
			//save the socket status entered
			const rooms = Array.from(client.rooms);
			const currentRooms = rooms.filter(room => room.startsWith('current:'));
			currentRooms.forEach(room => client.leave(room));			
			await client.join(`current:${roomId}`);
			client.emit('status', `${roomId} entered`);
		} else {
			client.emit('error', { message: 'You do not have permission to join this chat.' });
			return null
		}
	}		

	@SubscribeMessage('leaveChat')
	async handleLeaveChat(
		@ConnectedSocket() client: AuthenticatedSocket
	) {
		const rooms = Array.from(client.rooms);
		const currentRooms = rooms.filter(room => room.startsWith('current:'));
		currentRooms.forEach(room => client.leave(room));
		client.emit('status', `leaved from all rooms`);
	}		

	@SubscribeMessage('sendMessage')
	async handleSendMessage(
		@ConnectedSocket() client: AuthenticatedSocket,
		@MessageBody() data: { roomId: string, content: string }
	) {
		const userId = client.user.id;
		const { roomId, content } = data
		const isAvailable = await this.chatService.isChatMember(userId, roomId);
		if (isAvailable){
			//check live sockets
			const members = await this.chatService.getParticipants(roomId);
			const activeUsersSet = new Set<string>();
			await Promise.all(members.map(async (memberId) => {
				const sockets = await this.server.in(`user:${memberId}`).allSockets();
				for (const socketId of sockets) {
					const socket = this.server.sockets.sockets.get(socketId);
					if (socket && socket.rooms.has(`current:${roomId}`)) {
						activeUsersSet.add(memberId);
						break; 
					}
				}
			}));
			//send message
			const message = await this.chatService.sendMessage(roomId, userId, content, Array.from(activeUsersSet));
			this.server.to(roomId).emit('newMessage', message);
			//update chatlist for all members for all devices
			members.forEach(async(i) => {
				const chatList = await this.chatService.getChatList(i);
				const filteredChat = chatList.filter(chat => chat.available);			
				this.server.to(`user:${i}`).emit('chatList', filteredChat);
			})
		}else {
			client.emit('error', { message: 'You do not have permission to join this chat.' });
		}
	}

	@SubscribeMessage('markAsRead')
	async handleMarkAsRead(
		@ConnectedSocket() client: AuthenticatedSocket,
		@MessageBody() data: { roomId: string, messageId: string }
	) {
		const userId = client.user.id;
		const { roomId, messageId } = data
		await this.chatService.markMessageAsRead(roomId, userId, messageId);
		this.server.to(client.id).emit('status', { messageId: messageId });
		client.emit('status', `${messageId} marked`)
	}

	/******************************* ONLY FOR DEV **********************************/
	@SubscribeMessage('resetRedisForDevelopment')
	async handleResetRedis(@ConnectedSocket() client: AuthenticatedSocket) {
		const isDevelopment = this.configService.get('NODE_ENV') === 'dev';
		if (!isDevelopment) {
			client.emit('redisStatus', { success: false, message: 'This operation is only allowed in development environment' });
			return;
		}
		try {
			await this.chatService.resetRedis();
			console.log('Redis data reset completed');
			client.emit('redisStatus', { success: true, message: 'Redis data has been reset' });
		} catch (error) {
			console.error('Error resetting Redis data:', error);
			client.emit('redisStatus', { success: false, message: 'Failed to reset Redis data' });
		}
	}
}