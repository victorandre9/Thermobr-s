import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

export const hashSenha = (s: string) => bcrypt.hash(s, 12);
export const conferirSenha = (s: string, h: string) => bcrypt.compare(s, h);
export const gerarToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function validarForcaSenha(s: string): string | null {
  if (s.length < 10) return "A senha precisa ter ao menos 10 caracteres.";
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return "Use letras e números na senha.";
  return null;
}
