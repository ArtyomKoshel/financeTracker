import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

declare global {
  interface Window {
    Pusher: typeof Pusher;
  }
}

type UpdateHandler = (target: string) => void;

const WS_KEY = import.meta.env.VITE_REVERB_APP_KEY ?? import.meta.env.VITE_PUSHER_APP_KEY ?? 'app-key';

const isRemote = !['localhost', '127.0.0.1'].includes(window.location.hostname);
const WS_HOST = isRemote ? window.location.hostname : (import.meta.env.VITE_REVERB_HOST ?? '127.0.0.1');
const WS_PORT = isRemote ? (window.location.port || (window.location.protocol === 'https:' ? '443' : '80')) : (import.meta.env.VITE_REVERB_PORT ?? '8080');
const WS_TLS = isRemote && window.location.protocol === 'https:';

/**
 * WebSocket service via Laravel Reverb (Pusher protocol)
 */
class WebSocketService {
  private echo: Echo<'reverb'> | null = null;
  private handlers: Set<UpdateHandler> = new Set();

  connect(userId?: number): void {
    if (this.echo) return;
    if (!userId) return;

    try {
      window.Pusher = Pusher;
      this.echo = new Echo({
        broadcaster: 'reverb',
        key: WS_KEY,
        wsHost: WS_HOST,
        wsPort: Number(WS_PORT),
        wssPort: Number(WS_PORT),
        forceTLS: WS_TLS,
        disableStats: true,
        enabledTransports: WS_TLS ? ['wss'] : ['ws', 'wss'],
        authEndpoint: '/broadcasting/auth',
        auth: {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
          },
        },
      });

      this.echo.private(`user.${userId}`).listen('.update', (e: { target?: string }) => {
        if (e?.target) {
          this.notifyHandlers(e.target);
        }
      });

      console.log('WebSocket connected (private channel)');
    } catch (error) {
      console.warn('WebSocket connection failed:', error);
    }
  }

  private notifyHandlers(target: string): void {
    for (const handler of this.handlers) {
      try {
        handler(target);
      } catch (error) {
        console.error('Handler error:', error);
      }
    }
  }

  onUpdate(handler: UpdateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  disconnect(): void {
    if (this.echo) {
      this.echo.disconnect();
      this.echo = null;
    }
  }

  isConnected(): boolean {
    return this.echo !== null;
  }
}

export const wsService = new WebSocketService();
export default wsService;
