export class DocumentScheduler<T> {
    private timers = new Map<string, ReturnType<typeof setTimeout>>();
    private disposed = false;
    constructor(private readonly update: (value: T) => Promise<void>, private readonly onError: (error: unknown) => void, private delay = 300) {}
    schedule(key: string, value: T): void {
        if (this.disposed) { return; }
        this.cancel(key);
        this.timers.set(key, setTimeout(() => {
            this.timers.delete(key);
            if (!this.disposed) { void this.update(value).catch(this.onError); }
        }, this.delay));
    }
    cancel(key: string): void { clearTimeout(this.timers.get(key)); this.timers.delete(key); }
    dispose(): void { this.disposed = true; for (const key of this.timers.keys()) { this.cancel(key); } }
}
