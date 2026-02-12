use socketioxide::extract::{SocketRef, State};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info};

use crate::models::UserInfo;
use crate::services::ChatService;
use crate::state::AppState;
use crate::utils::verify_token;

use super::{register_chat_handlers, register_message_handlers};

/// Shared user sessions storage
pub type UserSessions = Arc<RwLock<HashMap<String, UserInfo>>>;

/// Handle new socket connection
pub async fn on_connect(socket: SocketRef, State(state): State<AppState>, State(sessions): State<UserSessions>) {
    info!("New connection: {}", socket.id);

    // Extract token from handshake headers
    let token = socket
        .req_parts()
        .headers
        .get("token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    // Verify JWT token
    let payload = match verify_token(token, &state.config.jwt_secret) {
        Ok(p) => p,
        Err(e) => {
            error!("Token verification failed: {}", e);
            let _ = socket.emit("error", "connection failed");
            socket.disconnect().ok();
            return;
        }
    };

    let user_info: UserInfo = payload.into();
    let user_id = user_info.id.clone();
    let socket_id = socket.id.to_string();

    // Store user info in sessions
    {
        let mut sessions_write = sessions.write().await;
        sessions_write.insert(socket_id.clone(), user_info.clone());
    }

    // Join user's personal room
    let user_room = format!("user:{}", user_id);
    if let Err(e) = socket.join(user_room.clone()) {
        error!("Failed to join user room: {}", e);
    }

    let _ = socket.emit("status", format!("user:{} connected", user_id));

    // Get chat list and join chat rooms
    let chat_service = ChatService::new(crate::services::RedisService::new(state.redis.clone()));

    match chat_service.get_chat_list(&user_id).await {
        Ok(chat_list) => {
            let filtered_chat: Vec<_> = chat_list
                .iter()
                .filter(|chat| chat.available)
                .cloned()
                .collect();

            // Join all available chat rooms
            for chat in &filtered_chat {
                if let Err(e) = socket.join(chat.room_id.clone()) {
                    error!("Failed to join room {}: {}", chat.room_id, e);
                }
            }

            let _ = socket.emit("status", "chat list updated");
            // Wrap in tuple to send as single argument (socketioxide expands arrays into multiple args)
            let _ = socket.emit("chatList", (&filtered_chat,));
        }
        Err(e) => {
            error!("Failed to get chat list: {}", e);
        }
    }

    // Register event handlers
    register_chat_handlers(&socket);
    register_message_handlers(&socket);

    // Register disconnect handler
    let sessions_clone = sessions.clone();
    let socket_id_clone = socket_id.clone();
    socket.on_disconnect(move |socket: SocketRef| {
        let sessions = sessions_clone.clone();
        let sid = socket_id_clone.clone();
        async move {
            let user_id = {
                let sessions_read = sessions.read().await;
                sessions_read.get(&sid).map(|u| u.id.clone()).unwrap_or_default()
            };

            // Remove from sessions
            {
                let mut sessions_write = sessions.write().await;
                sessions_write.remove(&sid);
            }

            info!("Disconnected: {} (user: {})", socket.id, user_id);
            let _ = socket.emit("status", format!("{} disconnected", user_id));
        }
    });

    // Register resetRedisForDevelopment handler
    socket.on(
        "resetRedisForDevelopment",
        |socket: SocketRef, State(state): State<AppState>| async move {
            info!("resetRedisForDevelopment called");
            let chat_service = ChatService::new(crate::services::RedisService::new(state.redis.clone()));

            match chat_service.reset_redis().await {
                Ok(_) => {
                    info!("Redis data reset completed");
                    let _ = socket.emit(
                        "redisStatus",
                        serde_json::json!({
                            "success": true,
                            "message": "Redis data has been reset"
                        }),
                    );
                }
                Err(e) => {
                    error!("Error resetting Redis data: {}", e);
                    let _ = socket.emit(
                        "redisStatus",
                        serde_json::json!({
                            "success": false,
                            "message": "Failed to reset Redis data"
                        }),
                    );
                }
            }
        },
    );
}
