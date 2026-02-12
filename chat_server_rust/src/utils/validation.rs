use anyhow::{anyhow, Result};
use regex::Regex;

const MAX_IMAGE_SIZE: usize = 5 * 1024 * 1024; // 5MB
const ALLOWED_FORMATS: [&str; 4] = ["png", "jpg", "jpeg", "gif"];

pub fn validate_image_content(content: &[String]) -> Result<()> {
    let re = Regex::new(r"^data:image/([a-z]+);base64,(.+)$")?;

    for (index, item) in content.iter().enumerate() {
        let captures = re.captures(item).ok_or_else(|| {
            anyhow!("Invalid image format for image {}", index + 1)
        })?;

        let format = captures.get(1).map(|m| m.as_str()).unwrap_or("");
        let base64_data = captures.get(2).map(|m| m.as_str()).unwrap_or("");

        if !ALLOWED_FORMATS.contains(&format) {
            return Err(anyhow!(
                "Unsupported image format for image {}. Allowed formats are: {}",
                index + 1,
                ALLOWED_FORMATS.join(", ")
            ));
        }

        // Calculate approximate size from base64
        let size_in_bytes = (base64_data.len() * 3) / 4;
        if size_in_bytes > MAX_IMAGE_SIZE {
            return Err(anyhow!(
                "Image {} size exceeds the limit of {}MB",
                index + 1,
                MAX_IMAGE_SIZE / (1024 * 1024)
            ));
        }
    }

    Ok(())
}
