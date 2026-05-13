<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class DataUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public string $target;

    private int $userId;

    public function __construct(string $target, ?int $userId = null)
    {
        $this->target = $target;
        $this->userId = $userId ?? (int) auth()->id();

        Log::channel('broadcast')->info("DataUpdated: {$this->target} → user.{$this->userId}");
    }

    /** @return array<PrivateChannel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('user.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'update';
    }

    public function broadcastWith(): array
    {
        return ['target' => $this->target];
    }
}
