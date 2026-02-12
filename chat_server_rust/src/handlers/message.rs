use std::collections::HashSet;

use socketioxide::extract::{Data, SocketRef, State};
use tracing::error;

use crate::models::{MarkDto, SendDto};
use crate::services::{ChatService, RedisService};
use crate::state::AppState;

use super::UserSessions;

/// Register message-related event handlers
pub fn register_message_handlers(socket: &SocketRef) {
    // sendMessage handler
    socket.on(
        "sendMessage",
        |socket: SocketRef, State(state): State<AppState>, State(sessions): State<UserSessions>, Data::<SendDto>(data)| async move {
            let socket_id = socket.id.to_string();
            let user_info = {
                let sessions_read = sessions.read().await;
                sessions_read.get(&socket_id).cloned()
            };

            let user_info = match user_info {
                Some(u) => u,
                None => {
                    let _ = socket.emit("error", "User not authenticated");
                    return;
                }
            };

            let user_id = &user_info.id;
            let room_id = &data.room_id;
            let chat_service = ChatService::new(RedisService::new(state.redis.clone()));

            // Check if user is a member
            match chat_service.is_chat_member(user_id, room_id).await {
                Ok(true) => {
                    // Get participants
                    let members = match chat_service.get_participants(room_id).await {
                        Ok(m) => m,
                        Err(e) => {
                            error!("Failed to get participants: {}", e);
                            let _ = socket.emit("error", "Failed to send message");
                            return;
                        }
                    };

                    // Check live sockets - find users who are in current:{roomId}
                    // This matches NestJS behavior exactly
                    let current_room = format!("current:{}", room_id);
                    let mut active_users_set = HashSet::new();

                    for member_id in &members {
                        // Get all sockets in user:{memberId} room
                        let user_room = format!("user:{}", member_id);
                        // sockets() and rooms() return Result<_, Infallible> - Infallible never fails
                        let member_sockets = socket.within(user_room).sockets().unwrap();

                        // Check if any of these sockets are in current:{roomId}
                        'socket_loop: for member_socket in member_sockets {
                            let socket_rooms = member_socket.rooms().unwrap();
                            for r in socket_rooms {
                                if r == current_room {
                                    active_users_set.insert(member_id.clone());
                                    break 'socket_loop;
                                }
                            }
                        }
                    }

                    let active_users: Vec<String> = active_users_set.into_iter().collect();

                    // Send message
                    match chat_service
                        .send_message(
                            room_id,
                            user_id,
                            data.message_type,
                            data.content,
                            active_users,
                        )
                        .await
                    {
                        Ok(message) => {
                            // Emit to users in current room
                            let _ = socket
                                .within(format!("current:{}", room_id))
                                .emit("newMessage", &message);

                            // Also emit chat history
                            if let Ok(history) = chat_service.get_messages(room_id, 50).await {
                                // Wrap in tuple to send as single argument
                                let _ = socket
                                    .within(format!("current:{}", room_id))
                                    .emit("chatHistory", (&history,));
                            }

                            // Update chat list for all members
                            for member_id in &members {
                                if let Ok(chat_list) = chat_service.get_chat_list(member_id).await {
                                    let filtered_chat: Vec<_> =
                                        chat_list.into_iter().filter(|c| c.available).collect();
                                    // Wrap in tuple to send as single argument
                                    let _ = socket
                                        .within(format!("user:{}", member_id))
                                        .emit("chatList", (&filtered_chat,));
                                }
                            }
                        }
                        Err(e) => {
                            error!("Failed to send message: {}", e);
                            let _ = socket.emit("error", "Failed to send message");
                        }
                    }
                }
                Ok(false) => {
                    let _ = socket.emit(
                        "error",
                        serde_json::json!({
                            "message": "You do not have permission to join this chat."
                        }),
                    );
                }
                Err(e) => {
                    error!("Failed to check chat membership: {}", e);
                    let _ = socket.emit("error", "Failed to send message");
                }
            }
        },
    );

    // markAsRead handler
    socket.on(
        "markAsRead",
        |socket: SocketRef, State(state): State<AppState>, State(sessions): State<UserSessions>, Data::<MarkDto>(data)| async move {
            let socket_id = socket.id.to_string();
            let user_info = {
                let sessions_read = sessions.read().await;
                sessions_read.get(&socket_id).cloned()
            };

            let user_info = match user_info {
                Some(u) => u,
                None => {
                    let _ = socket.emit("error", "User not authenticated");
                    return;
                }
            };

            let chat_service = ChatService::new(RedisService::new(state.redis.clone()));

            match chat_service
                .mark_message_as_read(&data.room_id, &user_info.id, Some(&data.message_id))
                .await
            {
                Ok(_) => {
                    let _ = socket.emit(
                        "status",
                        serde_json::json!({ "messageId": data.message_id }),
                    );
                    let _ = socket.emit("status", format!("{} marked", data.message_id));
                }
                Err(e) => {
                    error!("Failed to mark message as read: {}", e);
                    let _ = socket.emit("error", "Failed to mark message as read");
                }
            }
        },
    );
}
