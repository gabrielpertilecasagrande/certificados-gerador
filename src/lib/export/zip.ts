import { Zip, ZipPassThrough, ZipDeflate } from "fflate";

export interface ByteSink {
  write(chunk: Uint8Array): void | Promise<void>;
  close(): Promise<Blob | null>;
  abort(): Promise<void>;
}

/** Acumula em memória e gera um Blob ao final (o navegador pode descarregar Blobs grandes em disco). */
export class MemorySink implements ByteSink {
  private parts: BlobPart[] = [];
  constructor(private readonly type: string) {}
  write(chunk: Uint8Array) {
    this.parts.push(chunk.slice().buffer as ArrayBuffer);
  }
  async close() {
    const blob = new Blob(this.parts, { type: this.type });
    this.parts = [];
    return blob;
  }
  async abort() {
    this.parts = [];
  }
}

/** Grava direto num arquivo escolhido pelo usuário (File System Access API), sem manter tudo em memória. */
export class FileSink implements ByteSink {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly writable: FileSystemWritableFileStream) {}
  write(chunk: Uint8Array) {
    const copy = chunk.slice();
    this.queue = this.queue.then(() => this.writable.write(copy));
    return this.queue;
  }
  async close() {
    await this.queue;
    await this.writable.close();
    return null;
  }
  async abort() {
    await this.queue.catch(() => {});
    await this.writable.abort().catch(() => {});
  }
}

/** ZIP em streaming: cada arquivo é adicionado e liberado imediatamente. */
export class StreamingZip {
  private zip: Zip;
  private error: Error | null = null;
  private finished: Promise<void>;
  private pending: Promise<void> = Promise.resolve();
  private entries = 0;
  private bytes = 0;

  constructor(private readonly sink: ByteSink) {
    let resolve!: () => void;
    let reject!: (e: Error) => void;
    this.finished = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.error = err;
        reject(err);
        return;
      }
      this.pending = this.pending.then(() => sink.write(chunk));
      if (final) this.pending.then(resolve, reject);
    });
  }

  /** PDFs/PNGs/JPGs já são comprimidos: armazenar sem recompressão é mais rápido. */
  add(path: string, data: Uint8Array, compress = false) {
    if (this.error) throw this.error;
    // O formato ZIP clássico (sem ZIP64) não comporta mais de 65.535 arquivos nem 4 GB.
    this.entries++;
    this.bytes += data.length + path.length + 100;
    if (this.entries > 65_000 || this.bytes > 3.9 * 1024 ** 3) {
      throw new Error("O ZIP ultrapassaria 4 GB ou 65 mil arquivos. Exporte em partes (ex.: por seleção) ou use PDF/JPG em menor resolução.");
    }
    const file = compress ? new ZipDeflate(path, { level: 6 }) : new ZipPassThrough(path);
    this.zip.add(file);
    file.push(data, true);
  }

  async finish(): Promise<Blob | null> {
    this.zip.end();
    await this.finished;
    await this.pending;
    return this.sink.close();
  }

  async abort() {
    this.zip.terminate();
    await this.sink.abort();
  }
}
