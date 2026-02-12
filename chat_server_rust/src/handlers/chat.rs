use socketioxide::extract::{Data, SocketRef, State};
use socketioxide::SocketIo;
use tracing::{error, info};

use crate::models::{EnterDto, InitDto, RoomMembersResponse};
use crate::services::{ChatService, RedisService};
use crate::state::AppState;

use super::UserSessions;

/// Register chat-related event handlers
pub fn register_chat_handlers(socket: &SocketRef) {
    // initializeChat handler
    socket.on(
        "initializeChat",
        |socket: SocketRef, io: SocketIo, State(state): State<AppState>, State(sessions): State<UserSessions>, Data::<InitDto>(data)| async move {
            info!("initializeChat called");
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

            let user_id = user_info.id;
            let participants = data.participants.clone();

            // Create unique member set including current user (matches NestJS: Array.from(new Set([userId, ...participants])))
            let mut member_set: Vec<String> = vec![user_id.clone()];
            for p in participants.iter() {
                if !member_set.contains(p) {
                    member_set.push(p.clone());
                }
            }

            let chat_service = ChatService::new(RedisService::new(state.redis.clone()));

            match chat_service.initialize_chat(&member_set).await {
                Ok(room_id) => {
                    info!("initializeChat: room {} created, members: {:?}", room_id, member_set);

                    // For each member, join all their connected sockets to the new room
                    // (matches NestJS: for each memberId -> get all sockets in user:memberId room -> join roomId)
                    for member_id in &member_set {
                        let user_room = format!("user:{}", member_id);

                        // Get all sockets in this user's room using io.within().sockets()
                        match io.within(user_room.clone()).sockets() {
                            Ok(sockets_in_room) => {
                                info!("initializeChat: found {} sockets in room {}", sockets_in_room.len(), user_room);
                                for member_socket in sockets_in_room {
                                    // Join each socket to the new chat room
                                    let _ = member_socket.join(room_id.clone());
                                    info!("initializeChat: joined socket {} to room {}", member_socket.id, room_id);
                                }
                            }
                            Err(e) => {
                                info!("initializeChat: error getting sockets for {}: {:?}", user_room, e);
                            }
                        }

                        // Update chat list for each member (send to all their devices)
                        if let Ok(chat_list) = chat_service.get_chat_list(member_id).await {
                            let filtered_chat: Vec<_> = chat_list
                                .into_iter()
                                .filter(|c| c.available)
                                .collect();
                            info!("initializeChat: sending chatList to {} with {} items", user_room, filtered_chat.len());
                            // Wrap in tuple to send as single argument (socketioxide expands arrays into multiple args)
                            let _ = io.within(user_room).emit("chatList", (&filtered_chat,));
                        }
                    }

                    let _ = socket.emit("status", format!("{} initialized", room_id));
                    let _ = socket.emit(
                        "roomMembers",
                        RoomMembersResponse {
                            room_id,
                            members: participants,
                        },
                    );
                }
                Err(e) => {
                    error!("Failed to initialize chat: {}", e);
                    let _ = socket.emit("error", "Failed to initialize chat");
                }
            }
        },
    );

    // getChatList handler
    socket.on(
        "getChatList",
        |socket: SocketRef, State(state): State<AppState>, State(sessions): State<UserSessions>| async move {
            info!("getChatList called");
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

            match chat_service.get_chat_list(&user_info.id).await {
                Ok(chat_list) => {
                    info!("getChatList: total {} chats before filter", chat_list.len());
                    let filtered_chat: Vec<_> =
                        chat_list.into_iter().filter(|c| c.available).collect();
                    info!("getChatList: {} chats after filter", filtered_chat.len());
                    // Wrap in tuple to send as single argument (socketioxide expands arrays into multiple args)
                    let _ = socket.emit("chatList", (&filtered_chat,));
                }
                Err(e) => {
                    error!("Failed to get chat list: {}", e);
                    let _ = socket.emit("error", "Failed to get chat list");
                }
            }
        },
    );

    // enterChat handler
    socket.on(
        "enterChat",
        |socket: SocketRef, State(state): State<AppState>, State(sessions): State<UserSessions>, Data::<EnterDto>(data)| async move {
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
                    // Mark all messages as read
                    if let Err(e) = chat_service
                        .mark_message_as_read(room_id, user_id, None)
                        .await
                    {
                        error!("Failed to mark messages as read: {}", e);
                    }

                    // Get chat history
                    match chat_service.get_messages(room_id, 50).await {
                        Ok(history) => {
                            // Wrap in tuple to send as single argument
                            let _ = socket.emit("chatHistory", (&history,));
                        }
                        Err(e) => {
                            error!("Failed to get chat history: {}", e);
                        }
                    }

                    // Update chat list for all user devices
                    if let Ok(chat_list) = chat_service.get_chat_list(user_id).await {
                        let filtered_chat: Vec<_> =
                            chat_list.into_iter().filter(|c| c.available).collect();
                        // Wrap in tuple to send as single argument
                        let _ = socket
                            .within(format!("user:{}", user_id))
                            .emit("chatList", (&filtered_chat,));
                    }

                    // Leave previous current rooms and join new one
                    // rooms() returns Result<Vec<Cow<str>>, Infallible> - Infallible never fails
                    let rooms = socket.rooms().unwrap();
                    for room in rooms {
                        if room.starts_with("current:") {
                            let _ = socket.leave(room);
                        }
                    }
                    let _ = socket.join(format!("current:{}", room_id));

                    let _ = socket.emit("status", format!("{} entered", room_id));
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
                    let _ = socket.emit("error", "Failed to enter chat");
                }
            }
        },
    );

    // leaveChat handler
    socket.on("leaveChat", |socket: SocketRef| async move {
        // rooms() returns Result<Vec<Cow<str>>, Infallible> - Infallible never fails
        let rooms = socket.rooms().unwrap();
        for room in rooms {
            if room.starts_with("current:") {
                let _ = socket.leave(room);
            }
        }
        let _ = socket.emit("status", "leaved from all rooms");
    });
}
