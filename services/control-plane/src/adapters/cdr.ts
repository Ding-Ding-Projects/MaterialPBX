import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { readSecret } from "../lib/files.js";

export interface RecordQuery { from: Date; to: Date; limit: number; offset: number }

export class CallRecordAdapter {
  #pool: Pool | null = null;
  constructor(private readonly dsnFile: string) {}

  async initialize(): Promise<void> {
    const dsn = await readSecret(this.dsnFile);
    const url = new URL(dsn);
    if (url.protocol !== "mysql:") throw new Error("FreePBX database DSN must use mysql://");
    this.#pool = createPool({ uri: dsn, connectionLimit: 4, enableKeepAlive: true, decimalNumbers: true });
  }

  async cdr(query: RecordQuery): Promise<Record<string, unknown>[]> {
    const [rows] = await this.#requirePool().execute<RowDataPacket[]>(
      `SELECT calldate, clid, src, dst, dcontext, channel, dstchannel, lastapp, duration,
              billsec, disposition, amaflags, accountcode, uniqueid, linkedid, recordingfile
         FROM asteriskcdrdb.cdr
        WHERE calldate >= ? AND calldate < ?
        ORDER BY calldate DESC LIMIT ? OFFSET ?`,
      [query.from, query.to, query.limit, query.offset]
    );
    return rows as Record<string, unknown>[];
  }

  async cel(query: RecordQuery): Promise<Record<string, unknown>[]> {
    const [rows] = await this.#requirePool().execute<RowDataPacket[]>(
      `SELECT eventtime, eventtype, cid_name, cid_num, exten, context, channame,
              appname, appdata, uniqueid, linkedid, peer, userdeftype, extra
         FROM asteriskcdrdb.cel
        WHERE eventtime >= ? AND eventtime < ?
        ORDER BY eventtime DESC LIMIT ? OFFSET ?`,
      [query.from, query.to, query.limit, query.offset]
    );
    return rows as Record<string, unknown>[];
  }

  async close() { await this.#pool?.end(); }
  #requirePool() { if (!this.#pool) throw new Error("Call record database adapter is not initialized"); return this.#pool; }
}
