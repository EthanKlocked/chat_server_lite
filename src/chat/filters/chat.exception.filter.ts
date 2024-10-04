import { Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';

@Catch()
export class ChatExceptionFilter extends BaseWsExceptionFilter {
	catch(exception: unknown, host: ArgumentsHost) {
		const client = host.switchToWs().getClient();
		if (exception instanceof BadRequestException) {
			// from ValidationPipe
			const response = (exception as BadRequestException).getResponse();
			client.emit('error', {
				status: 'validation_error',
				message: 'Validation failed',
				errors: response['message']
			});
		} else if (exception instanceof WsException) {
			// from socket
			client.emit('error', {
				status: 'ws_error',
				message: exception.message
			});
		} else {
			// from the others
			client.emit('error', {
				status: 'error',
				message: 'Internal server error'
			});
		}
		// server logging
		console.error('WebSocket Error:', exception);
	}
}
