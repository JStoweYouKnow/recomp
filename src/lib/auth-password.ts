import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, storedHash: string): Promise<boolean> {
  if (!plain || !storedHash) return false;
  try {
    return await bcrypt.compare(plain, storedHash);
  } catch {
    return false;
  }
}
