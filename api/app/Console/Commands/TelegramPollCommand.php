<?php

namespace App\Console\Commands;

use App\Services\Notifications\TelegramBotService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;

class TelegramPollCommand extends Command
{
    protected $signature = 'telegram:poll';

    protected $description = 'Start Telegram bot long polling';

    public function handle(TelegramBotService $bot): int
    {
        $token = config('telegram.bot_token');
        if (! $token) {
            $this->error('TELEGRAM_BOT_TOKEN is not set');

            return self::FAILURE;
        }

        $apiBase = "https://api.telegram.org/bot{$token}";

        $me = Http::get("{$apiBase}/getMe")->json();
        if (! ($me['ok'] ?? false)) {
            $this->error('Invalid bot token: '.json_encode($me));

            return self::FAILURE;
        }
        $this->info("Bot: @{$me['result']['username']}");

        $del = Http::post("{$apiBase}/deleteWebhook")->json();
        $this->info('Webhook cleared: '.($del['description'] ?? 'ok'));

        $this->info('Polling started. Waiting for messages...');

        $offset = 0;
        $timeout = 25;

        while (true) {
            $updates = $bot->getUpdates($offset, $timeout);

            foreach ($updates as $update) {
                $updateId = $update['update_id'] ?? 0;
                $text = $update['message']['text'] ?? '(no text)';
                $from = $update['message']['from']['first_name'] ?? '?';
                $this->line("[{$updateId}] {$from}: {$text}");

                $offset = $updateId + 1;

                try {
                    $bot->handleUpdate($update);
                } catch (\Exception $e) {
                    $this->error("Update {$updateId} error: {$e->getMessage()}");
                }
            }
        }
    }
}
