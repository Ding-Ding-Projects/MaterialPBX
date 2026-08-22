import { z } from "zod";

const EnvironmentSchema = z.object({
  MATERIALPBX_BIND: z.string().default("127.0.0.1"),
  MATERIALPBX_PORT: z.coerce.number().int().min(1).max(65535).default(8444),
  MATERIALPBX_PUBLIC_URL: z.string().url(),
  MATERIALPBX_DATA_DIR: z.string().default("/var/lib/materialpbx"),
  MATERIALPBX_NODE_NAME: z.string().min(1).max(128).default("MaterialPBX"),
  MATERIALPBX_ADMIN_TOKEN_FILE: z.string().default("/run/secrets/materialpbx_admin_token"),
  MATERIALPBX_TLS_CERT: z.string().optional(),
  MATERIALPBX_TLS_KEY: z.string().optional(),
  ASTERISK_AMI_HOST: z.string().default("127.0.0.1"),
  ASTERISK_AMI_PORT: z.coerce.number().int().min(1).max(65535).default(5038),
  ASTERISK_AMI_USERNAME: z.string().min(1).default("materialpbx"),
  ASTERISK_AMI_SECRET_FILE: z.string().default("/run/secrets/asterisk_ami_secret"),
  ASTERISK_ARI_URL: z.string().url().default("http://127.0.0.1:8088/ari"),
  ASTERISK_ARI_USERNAME: z.string().min(1).default("materialpbx"),
  ASTERISK_ARI_PASSWORD_FILE: z.string().default("/run/secrets/asterisk_ari_password"),
  FREEPBX_DATABASE_DSN_FILE: z.string().default("/run/secrets/freepbx_database_dsn"),
  ASTERISK_RECORDINGS_DIR: z.string().default("/var/spool/asterisk/monitor"),
  PRIVILEGED_HELPER_SOCKET: z.string().default("/run/materialpbx/privileged.sock"),
  FEDERATION_MAX_CLOCK_SKEW_SECONDS: z.coerce.number().int().min(5).max(300).default(60),
  FEDERATION_INVITE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600)
});

export type RuntimeConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const env = EnvironmentSchema.parse(process.env);
  const tls = env.MATERIALPBX_TLS_CERT && env.MATERIALPBX_TLS_KEY
    ? { certPath: env.MATERIALPBX_TLS_CERT, keyPath: env.MATERIALPBX_TLS_KEY }
    : null;
  return {
    bind: env.MATERIALPBX_BIND,
    port: env.MATERIALPBX_PORT,
    publicUrl: env.MATERIALPBX_PUBLIC_URL,
    dataDir: env.MATERIALPBX_DATA_DIR,
    nodeName: env.MATERIALPBX_NODE_NAME,
    adminTokenFile: env.MATERIALPBX_ADMIN_TOKEN_FILE,
    tls,
    ami: {
      host: env.ASTERISK_AMI_HOST,
      port: env.ASTERISK_AMI_PORT,
      username: env.ASTERISK_AMI_USERNAME,
      secretFile: env.ASTERISK_AMI_SECRET_FILE
    },
    ari: {
      baseUrl: env.ASTERISK_ARI_URL,
      username: env.ASTERISK_ARI_USERNAME,
      passwordFile: env.ASTERISK_ARI_PASSWORD_FILE
    },
    freepbxDatabaseDsnFile: env.FREEPBX_DATABASE_DSN_FILE,
    recordingsDir: env.ASTERISK_RECORDINGS_DIR,
    privilegedHelperSocket: env.PRIVILEGED_HELPER_SOCKET,
    federation: {
      maxClockSkewSeconds: env.FEDERATION_MAX_CLOCK_SKEW_SECONDS,
      invitationTtlSeconds: env.FEDERATION_INVITE_TTL_SECONDS
    }
  };
}
