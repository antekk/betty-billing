import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  sub: string; // user id
  phone: string;
}

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "30d";

function getSecret(envKey: string): Uint8Array {
  const secret = process.env[envKey];
  if (!secret) throw new Error(`${envKey} not set`);
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(userId: string, phone: string): Promise<string> {
  return new SignJWT({ phone } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getSecret("JWT_SECRET"));
}

export async function signRefreshToken(userId: string, phone: string): Promise<string> {
  return new SignJWT({ phone } as TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_EXPIRY)
    .sign(getSecret("JWT_REFRESH_SECRET"));
}

export async function verifyAccessToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_SECRET"));
  return payload as TokenPayload;
}

export async function verifyRefreshToken(token: string): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, getSecret("JWT_REFRESH_SECRET"));
  return payload as TokenPayload;
}
