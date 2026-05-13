<?php

namespace App\Services\Experimental;

use Illuminate\Support\Facades\Http;

/**
 * Анализ фото чека через Vision API (Groq или OpenAI ChatGPT).
 * Провайдер: GROQ_API_KEY или OPENAI_API_KEY (приоритет у OPENAI, если задан).
 */
class ReceiptAnalysisService
{
    private ?string $provider;

    private ?string $apiKey;

    private ?string $endpoint;

    private ?string $model;

    public function __construct()
    {
        $openaiKey = config('services.openai.key');
        $groqKey = config('services.groq.key');

        if (! empty($openaiKey)) {
            $this->provider = 'openai';
            $this->apiKey = $openaiKey;
            $this->endpoint = 'https://api.openai.com/v1/chat/completions';
            $this->model = config('services.openai.model', 'gpt-4o');
        } elseif (! empty($groqKey)) {
            $this->provider = 'groq';
            $this->apiKey = $groqKey;
            $this->endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            $this->model = 'meta-llama/llama-4-scout-17b-16e-instruct';
        } else {
            $this->provider = null;
            $this->apiKey = null;
            $this->endpoint = null;
            $this->model = null;
        }
    }

    public function isAvailable(): bool
    {
        return ! empty($this->apiKey);
    }

    public function getProvider(): ?string
    {
        return $this->provider;
    }

    /**
     * @return array{transactions: array<array{bank_merchant_name: string, amount: float, date: string, time: ?string, currency: string}>}
     */
    public function analyzeFromBase64(string $base64, string $mime = 'image/jpeg', ?int $clientId = null): array
    {
        if (! $this->isAvailable()) {
            return ['transactions' => []];
        }

        $url = "data:{$mime};base64,{$base64}";
        $start = microtime(true);

        $request = Http::withHeaders([
            'Authorization' => 'Bearer '.$this->apiKey,
            'Content-Type' => 'application/json',
        ])->timeout(60);

        if ($this->provider === 'groq' && config('services.groq.verify_ssl', true) === false) {
            $request = $request->withOptions(['verify' => false]);
        }

        $payload = [
            'model' => $this->model,
            'messages' => [
                [
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $this->getPrompt()],
                        ['type' => 'image_url', 'image_url' => ['url' => $url]],
                    ],
                ],
            ],
            'max_tokens' => 4096,
            'response_format' => ['type' => 'json_object'],
        ];

        $maxRetries = 2;
        $attempt = 0;

        while (true) {
            try {
                $response = $request->post($this->endpoint, $payload);
            } catch (\Throwable $e) {
                $durationMs = (int) round((microtime(true) - $start) * 1000);
                ExternalApiLogger::log(
                    $this->provider,
                    null,
                    $durationMs,
                    $clientId,
                    $this->endpoint,
                    'POST',
                    ['model' => $this->model, 'image_size' => strlen($base64)],
                    ['exception' => get_class($e)],
                    $e->getMessage()
                );
                \Log::channel('ai')->error('Receipt analysis exception', [
                    'provider' => $this->provider,
                    'message' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);
                throw $e;
            }

            $durationMs = (int) round((microtime(true) - $start) * 1000);
            $statusCode = $response->status();

            if (! $response->successful()) {
                ExternalApiLogger::log(
                    $this->provider,
                    $statusCode,
                    $durationMs,
                    $clientId,
                    $this->endpoint,
                    'POST',
                    ['model' => $this->model, 'image_size' => strlen($base64)],
                    ['body' => substr($response->body(), 0, 500)],
                    $response->body()
                );
                \Log::channel('ai')->warning('Receipt analysis failed', [
                    'provider' => $this->provider,
                    'status' => $statusCode,
                    'body' => $response->body(),
                ]);

                if ($statusCode === 429 && $attempt < $maxRetries) {
                    $waitSeconds = $this->parseRetryAfterSeconds($response->body());
                    \Log::channel('ai')->info('Receipt analysis: retrying after 429', [
                        'attempt' => $attempt + 1,
                        'wait_seconds' => $waitSeconds,
                    ]);
                    sleep($waitSeconds);
                    $attempt++;

                    continue;
                }

                return ['transactions' => []];
            }

            $content = $response->json('choices.0.message.content');
            $finishReason = $response->json('choices.0.finish_reason');
            if (! $content) {
                return ['transactions' => []];
            }

            $decoded = json_decode($content, true);
            if (! is_array($decoded) || ! isset($decoded['transactions'])) {
                return ['transactions' => []];
            }

            $truncated = $finishReason === 'length';

            ExternalApiLogger::log(
                $this->provider,
                $statusCode,
                $durationMs,
                $clientId,
                $this->endpoint,
                'POST',
                ['model' => $this->model, 'image_size' => strlen($base64)],
                ['transactions_count' => count($decoded['transactions']), 'finish_reason' => $finishReason],
                null
            );

            if ($truncated) {
                \Log::channel('ai')->warning('Receipt analysis truncated (finish_reason=length)', [
                    'provider' => $this->provider,
                    'transactions_found' => count($decoded['transactions']),
                ]);
            }

            $decoded['truncated'] = $truncated;

            return $decoded;
        }
    }

    /**
     * Извлекает время ожидания (секунды) из тела ответа Groq при 429.
     * Формат: "Please try again in 35.2512s"
     */
    private function parseRetryAfterSeconds(string $body): int
    {
        if (preg_match('/try again in ([\d.]+)s/i', $body, $m)) {
            return (int) ceil((float) $m[1]);
        }

        return 60;
    }

    private function getPrompt(): string
    {
        return <<<'PROMPT'
На изображении чек или выписка из банка. Извлеки ВСЕ транзакции — и расходы, и доходы (зарплата, возвраты, бонусы, переводы).
Верни JSON:
{
  "transactions": [
    {
      "bank_merchant_name": "краткое название получателя (например G. MINSK)",
      "raw_description": "полная строка транзакции как в документе — ОБЯЗАТЕЛЬНО, копируй целиком",
      "amount": число (всегда положительное),
      "type": "expense" или "income",
      "date": "YYYY-MM-DD",
      "time": "HH:MM" или null,
      "currency": "BYN",
      "suggested_category": "предположительная категория расхода"
    }
  ]
}

Правила:
- raw_description — ОБЯЗАТЕЛЬНО. Вся строка целиком из документа (дата, время, получатель, назначение, сумма). Копируй один в один.
- bank_merchant_name — краткое имя получателя для группировки (без даты и суммы).
- amount — всегда положительное число.
- type: "expense" для покупок, оплат, переводов другим. "income" для зарплаты, возвратов, бонусов, входящих переводов.
- Если видишь перевод между счетами ОДНОГО и ТОГО ЖЕ человека (например с карты на депозит) — пропусти его, не включай.
- suggested_category — угадай категорию расхода по типу мерчанта. Примеры: "Продукты" (супермаркеты, магазины еды), "Транспорт" (такси, топливо, общ. транспорт), "Жильё" (аренда, коммуналка), "Развлечения" (кино, рестораны, бары), "Здоровье" (аптеки, клиники), "Одежда", "Связь" (мобильная связь, интернет), "Подписки" (Netflix, Spotify). Для доходов — null.
- Даты в формате YYYY-MM-DD. Если год не указан, используй текущий.
PROMPT;
    }
}
