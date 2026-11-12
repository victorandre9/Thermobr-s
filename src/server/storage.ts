/**
 * Armazenamento privado de anexos. Nunca expõe URL pública: o download passa pela rota autorizada /api/anexos/[id].
 *  - local: diretório fora de /public (somente desenvolvimento/homologação local).
 *  - s3: bucket privado S3 compatível (AWS S3, Cloudflare R2, etc.).
 */
import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Storage { salvar(chave: string, dados: Buffer, mime: string): Promise<void>; ler(chave: string): Promise<Buffer>; }

function localStorage(): Storage {
  // Na Vercel só /tmp é gravável (temporário — apenas demonstração; produção usa S3).
  const base = path.resolve(process.env.STORAGE_LOCAL_DIR ?? (process.env.VERCEL ? "/tmp/thermobras-storage" : "./storage"));
  const resolver = (chave: string) => {
    const p = path.resolve(base, chave);
    if (!p.startsWith(base + path.sep)) throw new Error("Chave inválida");
    return p;
  };
  return {
    async salvar(chave, dados) { const p = resolver(chave); await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, dados); },
    async ler(chave) { return readFile(resolver(chave)); },
  };
}

function s3Storage(): Storage {
  // import dinâmico para não carregar o SDK quando não usado
  const cfg = { endpoint: process.env.S3_ENDPOINT || undefined, region: process.env.S3_REGION || "auto", bucket: process.env.S3_BUCKET!, ak: process.env.S3_ACCESS_KEY_ID!, sk: process.env.S3_SECRET_ACCESS_KEY! };
  if (!cfg.bucket || !cfg.ak || !cfg.sk) throw new Error("Armazenamento S3 não configurado (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).");
  const cliente = async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({ region: cfg.region, endpoint: cfg.endpoint, credentials: { accessKeyId: cfg.ak, secretAccessKey: cfg.sk }, forcePathStyle: !!cfg.endpoint });
  };
  return {
    async salvar(chave, dados, mime) {
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await (await cliente()).send(new PutObjectCommand({ Bucket: cfg.bucket, Key: chave, Body: dados, ContentType: mime }));
    },
    async ler(chave) {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      const r = await (await cliente()).send(new GetObjectCommand({ Bucket: cfg.bucket, Key: chave }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
}

export function getStorage(): Storage {
  const d = process.env.STORAGE_DRIVER ?? "local";
  if (d === "s3") return s3Storage();
  if (process.env.APP_ENV === "production") throw new Error("STORAGE_DRIVER=local não é permitido em produção. Configure um bucket privado (s3).");
  return localStorage();
}
