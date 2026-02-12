use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};

use crate::models::JwtPayload;

pub fn verify_token(token: &str, secret: &str) -> Result<JwtPayload> {
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);

    let token_data = decode::<JwtPayload>(token, &decoding_key, &validation)
        .map_err(|e| anyhow!("Token verification failed: {}", e))?;

    Ok(token_data.claims)
}
