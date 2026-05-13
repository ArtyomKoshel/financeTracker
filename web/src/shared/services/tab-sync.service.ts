/**
 * Синхронизация между вкладками через BroadcastChannel.
 * Когда одна вкладка получает обновление (WebSocket или локальное действие),
 * другие вкладки получают уведомление и обновляют данные.
 */
const CHANNEL = 'finance-tracker-sync';

type SyncHandler = (target: string) => void;

let channel: BroadcastChannel | null = null;
const handlers: Set<SyncHandler> = new Set();

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
}

export function initTabSync(wsNotify: (target: string) => void): void {
  const ch = getChannel();
  if (!ch) return;

  ch.onmessage = (e: MessageEvent<{ target: string }>) => {
    const { target } = e.data || {};
    if (target) {
      wsNotify(target);
    }
  };
}

export function broadcastUpdate(target: string): void {
  const ch = getChannel();
  if (!ch) return;
  ch.postMessage({ target });
}

export function onSync(handler: SyncHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
