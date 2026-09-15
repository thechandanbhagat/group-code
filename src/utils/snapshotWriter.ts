/** Coalesces bursts while guaranteeing a trailing, serialized write of the latest state. */
export class SnapshotWriter {
    private timer?: ReturnType<typeof setTimeout>;
    private dirty = false;
    private writing?: Promise<void>;
    private disposed = false;
    constructor(private readonly write: () => Promise<void>, private readonly onError: (error: unknown) => void, private delay = 250) {}

    schedule(): void {
        if (this.disposed) { return; }
        this.dirty = true;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { this.timer = undefined; void this.flush().catch(this.onError); }, this.delay);
    }

    async flush(): Promise<void> {
        clearTimeout(this.timer);
        this.timer = undefined;
        if (this.writing) {
            await this.writing;
            if (this.dirty) { await this.flush(); }
            return;
        }
        this.writing = (async () => {
            while (this.dirty) {
                this.dirty = false;
                try { await this.write(); }
                catch (error) { this.dirty = true; throw error; }
            }
        })();
        try { await this.writing; }
        finally { this.writing = undefined; }
    }

    dispose(): void { this.disposed = true; clearTimeout(this.timer); }
}
