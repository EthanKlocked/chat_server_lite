mod config;
mod handlers;
mod models;
mod services;
mod state;
mod utils;

use axum::{routing::get, Router};
use socketioxide::SocketIo;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower::ServiceBuilder;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::config::Config;
use crate::handlers::{on_connect, UserSessions};
use crate::state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env();
    let server_port = config.server_port;

    info!("Starting chat server on port {}", server_port);

    // Initialize app state
    let app_state = AppState::new(config).await?;

    // Initialize user sessions storage
    let user_sessions: UserSessions = Arc::new(RwLock::new(HashMap::new()));

    // Create Socket.IO layer
    let (socket_layer, io) = SocketIo::builder()
        .with_state(app_state.clone())
        .with_state(user_sessions.clone())
        .build_layer();

    // Register connection handler
    io.ns("/", on_connect);

    // Build CORS layer
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build Axum app
    let app = Router::new()
        .route("/", get(|| async { "Chat Server (Rust)" }))
        .layer(
            ServiceBuilder::new()
                .layer(cors)
                .layer(socket_layer),
        );

    // Start server
    let addr = format!("0.0.0.0:{}", server_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;

    info!("Server listening on {}", addr);

    axum::serve(listener, app).await?;

    Ok(())
}
