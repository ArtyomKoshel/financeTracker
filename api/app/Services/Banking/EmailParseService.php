<?php

namespace App\Services\Banking;

use App\Services\Ai\AiProviderService;
use App\Services\Ai\AiUsageService;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmailParseService
{
    public function __construct(private readonly AiUsageService $usageService) {}

    public function isAvailable(): bool
    {
        $providers = config('ai.providers', []);
        foreach ($providers as $cfg) {
            if (! empty($cfg['api_key'])) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return array<int, array{date: string, amount: float, currency: string, description: string, type: string}>
     */
    public function parseEmailText(string $text, int $clientId): array
    {
        $provider = AiProviderService::getProviderForUser($clientId);
        $config = AiProviderService::getProviderConfig($provider);

        if (empty($config['api_key'])) {
            return [];
        }

        $today = now()->format('Y-m-d');
        $prompt = <<<PROMPT
You are a financial assistant. Extract all bank transactions from the email text below.
Today's date: {$today}

Return ONLY valid JSON with this exact structure (no extra text):
{
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "amount": 12.50,
      "currency": "BYN",
      "description": "short description",
      "type": "expense"
    }
  ]
}

Rules:
- type must be "income" or "expense"
- amount must be positive number
- currency: BYN, USD, EUR, or RUB
- If date is not explicit, use today's date
- If no transactions found, return {"transactions": []}

Email text:
{$text}
PROMPT;

        try {
            if ($provider === 'anthropic') {
                $rawJson = $this->callAnthropic($config, $prompt);
            } else {
                $rawJson = $this->callOpenAiCompatible($config, $prompt);
            }

            $jsonStart = strpos($rawJson, '{');
            $jsonEnd = strrpos($rawJson, '}');
            if ($jsonStart === false || $jsonEnd === false) {
                return [];
            }
            $json = substr($rawJson, $jsonStart, $jsonEnd - $jsonStart + 1);

            /** @var array{transactions?: array<int, array{date?: string, amount?: float|int, currency?: string, description?: string, type?: string}>}|null $decoded */
            $decoded = json_decode($json, true);

            if (! is_array($decoded) || empty($decoded['transactions'])) {
                return [];
            }

            return array_values(array_filter(array_map(function ($t) use ($today) {
                if (! isset($t['amount']) || (float) $t['amount'] <= 0) {
                    return null;
                }

                return [
                    'date' => $this->normalizeDate($t['date'] ?? $today),
                    'amount' => abs((float) $t['amount']),
                    'currency' => strtoupper($t['currency'] ?? 'BYN'),
                    'description' => trim($t['description'] ?? ''),
                    'type' => in_array($t['type'] ?? '', ['income', 'expense']) ? $t['type'] : 'expense',
                ];
            }, $decoded['transactions'])));
        } catch (\Throwable $e) {
            Log::warning('EmailParseService error: '.$e->getMessage());

            return [];
        }
    }

    private function normalizeDate(string $raw): string
    {
        try {
            return \Carbon\Carbon::parse($raw)->format('Y-m-d');
        } catch (\Throwable) {
            return now()->format('Y-m-d');
        }
    }

    /** @param array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool} $config */
    private function callOpenAiCompatible(array $config, string $prompt): string
    {
        $http = Http::withToken((string) $config['api_key'])
            ->withHeaders(['Content-Type' => 'application/json'])
            ->timeout(30);

        if (isset($config['verify_ssl']) && $config['verify_ssl'] === false) {
            $http = $http->withoutVerifying();
        }

        $response = $http->post("{$config['base_url']}/chat/completions", [
            'model' => $config['model'],
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'temperature' => 0.1,
            'max_tokens' => 1024,
            'response_format' => ['type' => 'json_object'],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('AI API error: '.$response->status());
        }

        $userId = Auth::id();
        if ($userId) {
            $this->usageService->storeFromResponse((int) $userId, $response);
        }

        /** @var array{choices: array<int, array{message: array{content: string}}>} $body */
        $body = $response->json();

        return $body['choices'][0]['message']['content'] ?? '';
    }

    /** @param array{base_url: string, api_key: string|null, model: string} $config */
    private function callAnthropic(array $config, string $prompt): string
    {
        $response = Http::withHeaders([
            'x-api-key' => (string) $config['api_key'],
            'anthropic-version' => '2023-06-01',
            'Content-Type' => 'application/json',
        ])->timeout(30)->post("{$config['base_url']}/messages", [
            'model' => $config['model'],
            'max_tokens' => 1024,
            'messages' => [['role' => 'user', 'content' => $prompt]],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Anthropic API error: '.$response->status());
        }

        $userId = Auth::id();
        if ($userId) {
            $this->usageService->storeFromResponse((int) $userId, $response);
        }

        /** @var array{content: array<int, array{text: string}>} $body */
        $body = $response->json();

        return $body['content'][0]['text'] ?? '';
    }
}
