export interface AnimationTask {
  run: () => void | (() => void);
}

/**
 * Animation is never allowed to become the execution source of truth.
 * Tasks are short and interruptible; the current TraceState remains authoritative.
 */
export class AnimationQueue {
  private tasks: AnimationTask[] = [];
  private running = false;
  private cancelCurrent: (() => void) | undefined;

  enqueue(task: AnimationTask): void {
    this.tasks.push(task);
    this.flush();
  }
  clear(): void {
    this.tasks.length = 0;
    this.cancelCurrent?.();
    this.cancelCurrent = undefined;
    this.running = false;
  }
  private flush(): void {
    if (this.running || !this.tasks.length) return;
    this.running = true;
    const task = this.tasks.shift()!;
    this.cancelCurrent = typeof task.run() === 'function' ? task.run() as () => void : undefined;
    queueMicrotask(() => {
      this.cancelCurrent?.();
      this.cancelCurrent = undefined;
      this.running = false;
      this.flush();
    });
  }
}
