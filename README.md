```markdown
# 채팅 서버 프로젝트

이 프로젝트는 NestJS를 사용하여 구현된 실시간 채팅 서버입니다.

## 기능

- 실시간 메시지 전송
- 채팅방 생성 및 참여
- 텍스트 및 이미지 메시지 지원
- 메시지 읽음 상태 관리

## 설치 및 실행

```bash
npm install
npm run start:dev
```

## WebSocket 이벤트

### 연결
WebSocket 엔드포인트: `ws://your-domain.com/chat`

연결 시 헤더에 토큰을 포함해야 합니다:
```
{
  "token": "your-auth-token"
}
```

### 이벤트

#### 클라이언트 -> 서버

1. 채팅방 초기화
```typescript
socket.emit('initializeChat', { participants: string[] });
```

2. 채팅방 입장
```typescript
socket.emit('enterChat', { roomId: string });
```

3. 메시지 전송
```typescript
socket.emit('sendMessage', {
  roomId: string,
  type: 'text' | 'image',
  content: string[]
});
```

예시:
- 텍스트 메시지: `{ roomId: "room1", type: "text", content: ["Hello, World!"] }`
- 이미지 메시지: `{ roomId: "room1", type: "image", content: ["http://example.com/image1.jpg", "http://example.com/image2.jpg"] }`

4. 메시지 읽음 표시
```typescript
socket.emit('markAsRead', { roomId: string, messageId: string });
```

#### 서버 -> 클라이언트

1. 상태 업데이트
```typescript
socket.on('status', (message: string) => {
  console.log(message);
});
```

2. 채팅 목록 수신
```typescript
socket.on('chatList', (chatList: any[]) => {
  console.log(chatList);
});
```

3. 채팅 히스토리 수신
```typescript
socket.on('chatHistory', (messages: any[]) => {
  console.log(messages);
});
```

4. 새 메시지 수신
```typescript
socket.on('newMessage', (message: any) => {
  console.log(message);
});
```

## 에러 처리

서버는 에러 발생 시 다음과 같은 이벤트를 발생시킵니다:

```typescript
socket.on('error', (error: any) => {
  console.error(error);
});
```

## 데이터 구조

### 메시지 (ChatMessage)

```typescript
interface ChatMessage {
  id: string;
  senderId: string;
  type: 'text' | 'image';
  content: string[];
  timestamp: Date;
  readBy: string[];
}
```

## 주의사항

- 모든 WebSocket 통신은 인증된 사용자만 가능합니다.
- 메시지 전송 시 항상 `type`과 `content`를 올바르게 지정해야 합니다.
- 이미지 메시지의 경우, `content` 배열에 이미지 URL을 포함해야 합니다.