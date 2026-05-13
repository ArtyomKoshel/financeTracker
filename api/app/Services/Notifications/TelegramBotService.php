<?php

namespace App\Services\Notifications;

use App\Models\Account;
use App\Models\IncomeType;
use App\Models\User;
use App\Services\Accounts\AccountService;
use App\Services\Transactions\CategorizationService;
use App\Services\Transactions\TransactionService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;

class TelegramBotService
{
    private string $token;

    private string $apiBase;

    public function __construct(
        private readonly TelegramParserService $parser,
        private readonly TransactionService $transactionService,
        private readonly CategorizationService $categorizationService,
        private readonly AccountService $accountService,
    ) {
        $this->token = (string) config('telegram.bot_token');
        $this->apiBase = "https://api.telegram.org/bot{$this->token}";
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getUpdates(int $offset = 0, int $timeout = 30): array
    {
        try {
            $response = Http::withoutVerifying()->timeout($timeout + 5)->get("{$this->apiBase}/getUpdates", [
                'offset' => $offset,
                'timeout' => $timeout,
                'allowed_updates' => json_encode(['message']),
            ]);

            if ($response->successful()) {
                $data = $response->json();
                if (($data['ok'] ?? false) && is_array($data['result'] ?? null)) {
                    return $data['result'];
                }
            }
        } catch (\Exception $e) {
            Log::channel('telegram')->warning('getUpdates error: '.$e->getMessage());
        }

        return [];
    }

    public function handleUpdate(array $update): void
    {
        $message = $update['message'] ?? null;
        if (! $message) {
            return;
        }

        $chatId = (int) $message['chat']['id'];

        if (isset($message['voice']) || isset($message['audio'])) {
            $this->handleVoiceMessage($chatId, $message);

            return;
        }

        if (! isset($message['text'])) {
            return;
        }

        $text = trim($message['text']);

        if (str_starts_with($text, '/')) {
            $this->handleCommand($chatId, $text);

            return;
        }

        $this->handleTextMessage($chatId, $text);
    }

    private function handleCommand(int $chatId, string $text): void
    {
        $parts = explode(' ', $text, 2);
        $command = mb_strtolower($parts[0]);
        $argument = $parts[1] ?? '';

        match ($command) {
            '/start' => $this->commandStart($chatId, trim($argument)),
            '/balance' => $this->commandBalance($chatId),
            '/unlink' => $this->commandUnlink($chatId),
            '/help' => $this->commandHelp($chatId),
            default => $this->sendMessage($chatId, 'Неизвестная команда. Отправьте /help для списка команд.'),
        };
    }

    private function commandStart(int $chatId, string $code): void
    {
        $user = User::where('telegram_chat_id', $chatId)->first();
        if ($user) {
            $this->sendMessage($chatId, "Вы уже привязаны как {$user->name} ({$user->email}).\nОтправьте /unlink чтобы отвязать.");

            return;
        }

        if ($code === '') {
            $this->sendMessage($chatId, "Привет! Чтобы привязать аккаунт:\n\n1. Откройте Настройки в приложении\n2. Нажмите «Получить код привязки»\n3. Отправьте сюда: /start КОД");

            return;
        }

        $userId = Redis::get("telegram_link:{$code}");
        if (! $userId) {
            $this->sendMessage($chatId, 'Код не найден или истёк. Получите новый в настройках приложения.');

            return;
        }

        $linkUser = User::find((int) $userId);
        if (! $linkUser) {
            $this->sendMessage($chatId, 'Пользователь не найден.');

            return;
        }

        if ($linkUser->telegram_chat_id) {
            $this->sendMessage($chatId, 'Этот аккаунт уже привязан к другому Telegram.');

            return;
        }

        $linkUser->update(['telegram_chat_id' => $chatId]);
        Redis::del("telegram_link:{$code}");

        $this->sendMessage($chatId, "Аккаунт привязан: {$linkUser->name}\n\nТеперь отправляйте транзакции текстом или голосом:\n• кофе 5.50 → расход\n• зп 5000 → зарплата\n• 🎙 голосовое → распознаю автоматически\n\n/balance — баланс\n/help — все команды");
    }

    private function commandBalance(int $chatId): void
    {
        $user = $this->findUserByChatId($chatId);
        if (! $user) {
            return;
        }

        $accounts = $this->accountService->getAllForClient($user->id);
        $total = $this->accountService->getTotalBalance($user->id);

        $lines = ['Баланс: '.number_format($total, 2, '.', ' ').' BYN'];

        if ($accounts->count() > 1) {
            $lines[] = '';
            foreach ($accounts as $account) {
                $lines[] = "  {$account->name}: ".number_format((float) $account->balance, 2, '.', ' ').' BYN';
            }
        }

        $this->sendMessage($chatId, implode("\n", $lines));
    }

    private function commandUnlink(int $chatId): void
    {
        $user = User::where('telegram_chat_id', $chatId)->first();
        if (! $user) {
            $this->sendMessage($chatId, 'Аккаунт не привязан.');

            return;
        }

        $user->update(['telegram_chat_id' => null]);
        $this->sendMessage($chatId, 'Аккаунт отвязан. Отправьте /start КОД чтобы привязать снова.');
    }

    private function commandHelp(int $chatId): void
    {
        $this->sendMessage($chatId, implode("\n", [
            'Команды:',
            '/start КОД — привязать аккаунт',
            '/balance — текущий баланс',
            '/unlink — отвязать аккаунт',
            '/help — эта справка',
            '',
            'Транзакции текстом:',
            '• кофе 5.50 → расход 5.50 (кофе)',
            '• 100 такси → расход 100 (такси)',
            '• зп 5000 → зарплата',
            '• аванс 2500 → аванс',
            '• премия 1000 → бонус',
            '• доход 1000 фриланс → другой доход',
            '• 42 → расход 42 без описания',
            '',
            '🎙 Голосовые:',
            '• Отправьте голосовое — распознаю и создам транзакцию',
        ]));
    }

    private function handleTextMessage(int $chatId, string $text): void
    {
        $user = $this->findUserByChatId($chatId);
        if (! $user) {
            return;
        }

        $keywords = $this->buildIncomeKeywords($user->id);
        $parsed = $this->parser->parse($text, $keywords);
        if ($parsed === null) {
            $this->sendMessage($chatId, "Не удалось распознать. Отправьте в формате:\nкофе 5.50 или 100 такси\n\n/help — справка");

            return;
        }

        $this->createTransaction($chatId, $user, $parsed);
    }

    /**
     * @param  array{amount: float, type: string, description: string}  $data
     */
    private function createTransaction(int $chatId, User $user, array $data): void
    {
        Log::channel('telegram')->info('createTransaction: '.json_encode($data, JSON_UNESCAPED_UNICODE));

        $categoryId = null;
        $categoryLabel = '';

        if ($data['description'] !== '') {
            $suggestion = $this->categorizationService->suggestCategory($user->id, $data['description']);
            Log::channel('telegram')->info('categorization: desc="'.$data['description'].'", result='.json_encode($suggestion, JSON_UNESCAPED_UNICODE));
            if ($suggestion) {
                $categoryId = $suggestion['category_id'];
                $categoryLabel = " ({$suggestion['category_icon']} {$suggestion['category_name']})";
            }
        }

        app()->instance('client_id', $user->id);
        $accountId = Account::defaultIdForClient($user->id);

        try {

            $this->transactionService->create([
                'client_id' => $user->id,
                'amount' => $data['amount'],
                'type' => $data['type'],
                'date' => now()->format('Y-m-d'),
                'description' => $data['description'],
                'category_id' => $categoryId,
                'account_id' => $accountId,
                'source' => 'telegram',
            ]);

            if ($data['description'] !== '' && $categoryId) {
                $this->categorizationService->learnFromInput($user->id, $data['description'], $categoryId);
            }

            $typeLabel = $data['type'] === 'expense' ? 'Расход' : 'Доход';
            $amountFormatted = number_format($data['amount'], 2, '.', ' ');
            $descPart = $data['description'] !== '' ? " — {$data['description']}" : '';

            $this->sendMessage($chatId, "{$typeLabel}: {$amountFormatted} BYN{$descPart}{$categoryLabel}");
        } catch (\Exception $e) {
            Log::channel('telegram')->error('transaction error: '.$e->getMessage());
            $this->sendMessage($chatId, 'Ошибка при создании транзакции. Попробуйте ещё раз.');
        }
    }

    private function handleVoiceMessage(int $chatId, array $message): void
    {
        $user = $this->findUserByChatId($chatId);
        if (! $user) {
            return;
        }

        $voice = $message['voice'] ?? $message['audio'] ?? null;
        if (! $voice || ! isset($voice['file_id'])) {
            $this->sendMessage($chatId, 'Не удалось обработать голосовое сообщение.');

            return;
        }

        $this->sendMessage($chatId, '🎙 Распознаю...');

        try {
            $fileData = $this->downloadTelegramFile($voice['file_id']);
            if (! $fileData) {
                $this->sendMessage($chatId, 'Не удалось скачать аудио.');

                return;
            }

            $text = $this->transcribeAudio($fileData['content'], $fileData['extension']);
            if (! $text || trim($text) === '') {
                $this->sendMessage($chatId, 'Не удалось распознать речь. Попробуйте ещё раз.');

                return;
            }

            $keywords = $this->buildIncomeKeywords($user->id);
            $extracted = $this->extractTransactionFromText($text, $keywords);
            if (! $extracted) {
                $this->sendMessage($chatId, "📝 «{$text}»\nНе удалось извлечь транзакцию. Попробуйте текстом.");

                return;
            }

            $this->sendMessage($chatId, "📝 «{$text}»");
            $this->createTransaction($chatId, $user, $extracted);
        } catch (\Exception $e) {
            Log::channel('telegram')->error("voice error: {$e->getMessage()}");
            $this->sendMessage($chatId, 'Ошибка распознавания. Попробуйте текстом.');
        }
    }

    /**
     * @return array{content: string, extension: string}|null
     */
    private function downloadTelegramFile(string $fileId): ?array
    {
        $response = Http::withoutVerifying()->get("{$this->apiBase}/getFile", [
            'file_id' => $fileId,
        ]);

        if (! $response->successful()) {
            return null;
        }

        $data = $response->json();
        $filePath = $data['result']['file_path'] ?? null;
        if (! $filePath) {
            return null;
        }

        $fileUrl = "https://api.telegram.org/file/bot{$this->token}/{$filePath}";
        $fileResponse = Http::withoutVerifying()->get($fileUrl);

        if (! $fileResponse->successful()) {
            return null;
        }

        $extension = strtolower(pathinfo($filePath, PATHINFO_EXTENSION) ?: 'ogg');
        if ($extension === 'oga') {
            $extension = 'ogg';
        }

        return [
            'content' => $fileResponse->body(),
            'extension' => $extension,
        ];
    }

    private function transcribeAudio(string $audioContent, string $extension): ?string
    {
        $apiKey = config('ai.providers.groq.api_key');
        if (! $apiKey) {
            Log::channel('ai')->warning('Groq API key not set, cannot transcribe voice');

            return null;
        }

        $verifySsl = (bool) config('ai.providers.groq.verify_ssl', true);
        $tmpFile = tempnam(sys_get_temp_dir(), 'tg_voice_').".{$extension}";
        file_put_contents($tmpFile, $audioContent);

        try {
            Log::channel('ai')->info("Whisper transcribe: extension={$extension}");

            $response = Http::when(! $verifySsl, fn ($http) => $http->withoutVerifying())
                ->withToken($apiKey)
                ->timeout(30)
                ->attach('file', fopen($tmpFile, 'r'), "voice.{$extension}")
                ->post('https://api.groq.com/openai/v1/audio/transcriptions', [
                    'model' => 'whisper-large-v3',
                    'language' => 'ru',
                    'response_format' => 'text',
                ]);

            if ($response->successful()) {
                $transcribed = trim($response->body());
                Log::channel('ai')->info("Whisper result: \"{$transcribed}\"");

                return $transcribed;
            }

            Log::channel('ai')->warning("Groq transcribe failed: {$response->status()} {$response->body()}");

            return null;
        } finally {
            @unlink($tmpFile);
        }
    }

    /**
     * @param  array<string, string>  $incomeKeywords  keyword → income type code
     * @return array{amount: float, type: string, description: string}|null
     */
    private function extractTransactionFromText(string $text, array $incomeKeywords = []): ?array
    {
        $apiKey = config('ai.providers.groq.api_key');
        if (! $apiKey) {
            return null;
        }

        $verifySsl = (bool) config('ai.providers.groq.verify_ssl', true);

        $typesHint = 'expense';
        if ($incomeKeywords) {
            $codes = array_unique(array_values($incomeKeywords));
            $typesHint = 'expense, '.implode(', ', $codes);
        }

        $prompt = 'Извлеки из текста финансовую транзакцию. Верни JSON: {"amount":число,"type":"тип","description":"описание"}. '
            ."Типы: {$typesHint}. По умолчанию expense. "
            .'description — предмет/услуга, без слов расход/доход/трата и без суммы. Только JSON.';

        try {
            Log::channel('ai')->info("Groq extract: input=\"{$text}\", types=[{$typesHint}]");

            $response = Http::when(! $verifySsl, fn ($http) => $http->withoutVerifying())
                ->withToken($apiKey)
                ->timeout(10)
                ->post('https://api.groq.com/openai/v1/chat/completions', [
                    'model' => 'llama-3.3-70b-versatile',
                    'temperature' => 0,
                    'max_tokens' => 100,
                    'messages' => [
                        ['role' => 'system', 'content' => $prompt],
                        ['role' => 'user', 'content' => $text],
                    ],
                ]);

            if (! $response->successful()) {
                Log::channel('ai')->warning("Groq extract failed: {$response->status()} {$response->body()}");

                return null;
            }

            $content = trim($response->json('choices.0.message.content') ?? '');
            Log::channel('ai')->info("Groq extract: raw response=\"{$content}\"");

            if (preg_match('/\{.*\}/s', $content, $m)) {
                $content = $m[0];
            }

            $data = json_decode($content, true);
            if (! $data || ! isset($data['amount']) || (float) $data['amount'] <= 0) {
                Log::channel('ai')->warning('Groq extract: invalid JSON or amount <= 0, parsed='.json_encode($data));

                return null;
            }

            $result = [
                'amount' => (float) $data['amount'],
                'type' => $data['type'] ?? 'expense',
                'description' => trim($data['description'] ?? ''),
            ];

            Log::channel('ai')->info('Groq extract: result='.json_encode($result, JSON_UNESCAPED_UNICODE));

            return $result;
        } catch (\Exception $e) {
            Log::channel('ai')->warning("Groq extract error: {$e->getMessage()}");
        }

        return null;
    }

    private function findUserByChatId(int $chatId): ?User
    {
        $user = User::where('telegram_chat_id', $chatId)->first();
        if (! $user) {
            $this->sendMessage($chatId, 'Аккаунт не привязан. Отправьте /start КОД для привязки.');

            return null;
        }

        return $user;
    }

    /**
     * @return array<string, string> keyword → income type code
     */
    private function buildIncomeKeywords(int $clientId): array
    {
        $types = IncomeType::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->get(['code', 'label']);

        $map = [];
        foreach ($types as $type) {
            $map[mb_strtolower($type->label)] = $type->code;
            $map[mb_strtolower($type->code)] = $type->code;
        }

        return $map;
    }

    public function sendMessage(int $chatId, string $text): void
    {
        try {
            $response = Http::withoutVerifying()->post("{$this->apiBase}/sendMessage", [
                'chat_id' => $chatId,
                'text' => $text,
            ]);

            if (! $response->successful()) {
                Log::channel('telegram')->warning("sendMessage failed: {$response->status()} {$response->body()}");
            }
        } catch (\Exception $e) {
            Log::channel('telegram')->warning("sendMessage error: {$e->getMessage()}");
        }
    }
}
