# NestJS Redis Chat Server

A real-time chat server built with NestJS, using Redis as a data store and supporting multi-device connections per user.

## Features

- Real-time messaging using WebSockets (Socket.IO)
- Redis-based data storage for fast, in-memory operations
- JWT authentication
- Multi-device support for each user
- Group and private chat functionality
- Message read status tracking
- Flexible token authentication (works with any token format given the correct secret key)

## Prerequisites

- Node.js (v14+ recommended)
- Redis server
- npm or yarn

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/ethanklocked/chat_server_lite.git
   cd chat_server_lite
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` as `.env.dev` or `.env.prod`
   - Fill in the required variables (Redis connection, JWT secret, etc.)

## Usage

1. Start the server:
   ```
   npm run start
   ```

2. For development with watch mode:
   ```
   npm run start:dev
   ```

## API Documentation

### WebSocket Events

#### Client to Server:

- `initializeChat`: Create a new chat room
  - Payload: `{ participants: string[] }`

- `getChatList`: Get the list of chats for the current user

- `enterChat`: Enter a specific chat room
  - Payload: `{ roomId: string }`

- `leaveChat`: Leave the current chat room

- `sendMessage`: Send a message in the current chat room
  - Payload: `{ roomId: string, content: string }`

- `markAsRead`: Mark a message as read
  - Payload: `{ roomId: string, messageId: string }`

#### Server to Client:

- `status`: Various status updates
- `error`: Error messages
- `chatList`: Updated chat list
- `chatHistory`: Chat history when entering a room
- `newMessage`: New message in a chat room

## Authentication

The server uses JWT for authentication. Include the token in the `token` header when establishing the WebSocket connection.

## Multi-Device Support

Users can connect from multiple devices simultaneously. Each device will receive updates and can interact independently.

## Development

### Reset Redis (Development Only)

To reset Redis data during development:

1. Ensure the server is running in development mode (`NODE_ENV=dev`)
2. Send a `resetRedisForDevelopment` event to the server

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.