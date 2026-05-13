import { offlineService } from './offline.service';
import type { QueuedMutation } from './offline.service';
import { toast } from '@/shared/components/toast';

type SyncStatusListener = (syncing: boolean, pending: number) => void;

class SyncService {
  private syncing = false;
  private listeners = new Set<SyncStatusListener>();

  onStatusChange(fn: SyncStatusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(syncing: boolean, pending: number): void {
    this.listeners.forEach(fn => fn(syncing, pending));
  }

  async getPendingCount(): Promise<number> {
    return offlineService.getQueueCount();
  }

  async queueMutation(
    method: string,
    endpoint: string,
    body: string | null,
    description: string,
  ): Promise<void> {
    await offlineService.enqueue({
      method,
      endpoint,
      body,
      timestamp: Date.now(),
      description,
    });

    void offlineService.requestBackgroundSync();

    const count = await this.getPendingCount();
    this.notify(false, count);
  }

  async syncAll(): Promise<{ success: number; failed: number }> {
    if (this.syncing || !offlineService.isOnline) return { success: 0, failed: 0 };
    this.syncing = true;

    const queue = await offlineService.getQueue();
    if (queue.length === 0) {
      this.syncing = false;
      return { success: 0, failed: 0 };
    }

    this.notify(true, queue.length);

    let success = 0;
    let failed = 0;

    for (const mutation of queue) {
      try {
        await this.replayMutation(mutation);
        await offlineService.dequeue(mutation.id!);
        success++;
        this.notify(true, queue.length - success - failed);
      } catch (err) {
        console.error('[Sync] Failed to replay mutation:', mutation, err);
        failed++;

        if (this.isPermanentError(err)) {
          await offlineService.dequeue(mutation.id!);
          toast.error(`Не удалось: ${mutation.description}`);
        } else {
          break;
        }
      }
    }

    this.syncing = false;
    const remaining = await this.getPendingCount();
    this.notify(false, remaining);

    return { success, failed };
  }

  private async replayMutation(mutation: QueuedMutation): Promise<void> {
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`/api${mutation.endpoint}`, {
      method: mutation.method,
      headers,
      body: mutation.body,
    });

    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      (err as Error & { status: number }).status = response.status;
      throw err;
    }
  }

  private isPermanentError(err: unknown): boolean {
    const status = (err as Error & { status?: number }).status;
    if (!status) return false;
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
}

export const syncService = new SyncService();
