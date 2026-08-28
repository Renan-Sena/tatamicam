use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

const LICENSE_PUBLIC_KEY: &str = include_str!("../keys/license_public.pem");

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseClaims {
    pub hwid: String,
    pub token: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Serialize)]
pub struct VerifyResult {
    pub valid: bool,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn verify_license_jwt(jwt: String, expected_hwid: String) -> VerifyResult {
    let key = match DecodingKey::from_ed_pem(LICENSE_PUBLIC_KEY.as_bytes()) {
        Ok(k) => k,
        Err(_) => return VerifyResult { valid: false, reason: Some("Erro interno de chave.".into()) },
    };

    let mut validation = Validation::new(Algorithm::EdDSA);
    validation.validate_exp = true;

    match decode::<LicenseClaims>(&jwt, &key, &validation) {
        Ok(data) => {
            if data.claims.hwid != expected_hwid {
                VerifyResult { valid: false, reason: Some("Licença pertence a outra máquina.".into()) }
            } else {
                VerifyResult { valid: true, reason: None }
            }
        }
        Err(e) => VerifyResult { valid: false, reason: Some(format!("Assinatura inválida: {e}")) },
    }
}