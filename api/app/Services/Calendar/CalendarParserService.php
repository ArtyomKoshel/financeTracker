<?php

namespace App\Services\Calendar;

use App\Services\Ai\AiProviderService;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class CalendarParserService
{
    private const WEEKDAY_MAP = [
        'понедельник' => 1, 'вторник' => 2, 'среду' => 3, 'среда' => 3,
        'четверг' => 4, 'пятницу' => 5, 'пятница' => 5,
        'субботу' => 6, 'суббота' => 6, 'воскресенье' => 7,
    ];

    private const MONTH_MAP = [
        'января' => 1, 'февраля' => 2, 'марта' => 3, 'апреля' => 4,
        'мая' => 5, 'июня' => 6, 'июля' => 7, 'августа' => 8,
        'сентября' => 9, 'октября' => 10, 'ноября' => 11, 'декабря' => 12,
    ];

    /** @return array{title: string, start_at: string, end_at: string|null, is_all_day: bool}[] */
    public function parseFromText(string $text, int $userId): array
    {
        $rulesResult = $this->parseWithRules($text);

        if (! empty($rulesResult)) {
            return $rulesResult;
        }

        try {
            return $this->parseWithAi($text, $userId);
        } catch (\Throwable $e) {
            Log::channel('calendar')->warning('CalendarParserService: AI parsing failed', [
                'error' => $e->getMessage(),
            ]);

            return [];
        }
    }

    /** @return array{title: string, start_at: string, end_at: string|null, is_all_day: bool}[] */
    private function parseWithRules(string $text): array
    {
        $text = mb_strtolower(trim($text));
        $now = Carbon::now();

        $date = $this->extractDate($text, $now);
        if (! $date) {
            return [];
        }

        $time = $this->extractTime($text);
        $isAllDay = $time === null;

        if ($time !== null) {
            $date->setTime((int) $time['hour'], (int) $time['minute']);
        }

        $title = $this->extractTitle($text);
        if ($title === '') {
            return [];
        }

        $endAt = null;
        if (! $isAllDay) {
            $endAt = $date->copy()->addHour()->toDateTimeString();
        }

        return [[
            'title' => $title,
            'start_at' => $date->toDateTimeString(),
            'end_at' => $endAt,
            'is_all_day' => $isAllDay,
        ]];
    }

    private function extractDate(string $text, Carbon $now): ?Carbon
    {
        if (str_contains($text, 'сегодня')) {
            return $now->copy()->startOfDay();
        }

        if (str_contains($text, 'завтра')) {
            return $now->copy()->addDay()->startOfDay();
        }

        if (str_contains($text, 'послезавтра')) {
            return $now->copy()->addDays(2)->startOfDay();
        }

        foreach (self::WEEKDAY_MAP as $dayName => $dayOfWeek) {
            if (str_contains($text, $dayName)) {
                $date = $now->copy()->next($dayOfWeek);

                return $date->startOfDay();
            }
        }

        foreach (self::MONTH_MAP as $monthName => $monthNum) {
            if (preg_match('/(\d{1,2})\s+'.preg_quote($monthName, '/').'/', $text, $m)) {
                $day = (int) $m[1];
                $year = $now->year;
                $candidate = Carbon::createFromDate($year, $monthNum, $day);
                if ($candidate->lt($now->copy()->startOfDay())) {
                    $candidate->addYear();
                }

                return $candidate->startOfDay();
            }
        }

        if (preg_match('/(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?/', $text, $m)) {
            $day = (int) $m[1];
            $month = (int) $m[2];
            $year = isset($m[3]) ? (int) $m[3] : $now->year;
            if ($year < 100) {
                $year += 2000;
            }
            $candidate = Carbon::createFromDate($year, $month, $day);

            return $candidate->startOfDay();
        }

        return null;
    }

    /** @return array{hour: int, minute: int}|null */
    private function extractTime(string $text): ?array
    {
        if (preg_match('/(?:в\s+)?(\d{1,2})[:\.](\d{2})/', $text, $m)) {
            $hour = (int) $m[1];
            $minute = (int) $m[2];
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                return ['hour' => $hour, 'minute' => $minute];
            }
        }

        if (preg_match('/в\s+(\d{1,2})\s+час/', $text, $m)) {
            $hour = (int) $m[1];
            if ($hour >= 0 && $hour <= 23) {
                return ['hour' => $hour, 'minute' => 0];
            }
        }

        return null;
    }

    private function extractTitle(string $text): string
    {
        $cleaned = $text;

        $patterns = [
            '/\bсегодня\b/', '/\bзавтра\b/', '/\bпослезавтра\b/',
            '/\bв\s+\d{1,2}[:.]\d{2}\b/', '/\bв\s+\d{1,2}\s+час\w*\b/',
            '/\d{1,2}[.\/-]\d{1,2}(?:[.\/-]\d{2,4})?/',
        ];

        foreach (self::WEEKDAY_MAP as $dayName => $v) {
            $patterns[] = '/\b(?:в\s+)?'.preg_quote($dayName, '/').'\b/';
        }

        foreach (self::MONTH_MAP as $monthName => $v) {
            $patterns[] = '/\d{1,2}\s+'.preg_quote($monthName, '/').'/';
        }

        foreach ($patterns as $pattern) {
            $cleaned = preg_replace($pattern, '', $cleaned) ?? $cleaned;
        }

        $cleaned = preg_replace('/\s+/', ' ', $cleaned) ?? $cleaned;
        $cleaned = trim($cleaned, " \t\n\r\0\x0B,.-");

        return mb_ucfirst($cleaned);
    }

    /** @return array{title: string, start_at: string, end_at: string|null, is_all_day: bool}[] */
    private function parseWithAi(string $text, int $userId): array
    {
        $provider = AiProviderService::getProviderForUser($userId);
        $config = AiProviderService::getProviderConfig($provider);
        $apiKey = $config['api_key'] ?? null;

        if (! $apiKey) {
            return [];
        }

        $today = Carbon::now()->format('Y-m-d');
        $dayOfWeek = Carbon::now()->locale('ru')->dayName;

        $prompt = <<<PROMPT
Extract calendar events from the text below. Today is {$today} ({$dayOfWeek}).

Return JSON array of events: [{"title": "...", "start_at": "YYYY-MM-DD HH:mm:ss", "end_at": "YYYY-MM-DD HH:mm:ss" or null, "is_all_day": true/false}]

If no events found, return [].

Text: {$text}
PROMPT;

        if ($provider === 'anthropic') {
            $responseText = $this->callAnthropic($config, $prompt);
        } else {
            $responseText = $this->callOpenAiCompatible($config, $prompt);
        }

        return $this->parseAiResponse($responseText);
    }

    /** @param array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool} $config */
    private function callOpenAiCompatible(array $config, string $prompt): string
    {
        $http = Http::withToken((string) $config['api_key'])
            ->withHeaders(['Content-Type' => 'application/json']);

        if (isset($config['verify_ssl']) && $config['verify_ssl'] === false) {
            $http = $http->withoutVerifying();
        }

        $response = $http->post("{$config['base_url']}/chat/completions", [
            'model' => $config['model'],
            'messages' => [
                ['role' => 'user', 'content' => $prompt],
            ],
            'temperature' => 0.1,
            'max_tokens' => 512,
            'response_format' => ['type' => 'json_object'],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('AI API request failed: '.$response->status());
        }

        /** @var array{choices: array<int, array{message: array{content: string}}>} $body */
        $body = $response->json();

        return $body['choices'][0]['message']['content'] ?? '';
    }

    /** @param array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool} $config */
    private function callAnthropic(array $config, string $prompt): string
    {
        $response = Http::withHeaders([
            'x-api-key' => (string) $config['api_key'],
            'anthropic-version' => '2023-06-01',
            'Content-Type' => 'application/json',
        ])->post("{$config['base_url']}/messages", [
            'model' => $config['model'],
            'max_tokens' => 512,
            'messages' => [
                ['role' => 'user', 'content' => $prompt],
            ],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Anthropic API request failed: '.$response->status());
        }

        /** @var array{content: array<int, array{text: string}>} $body */
        $body = $response->json();

        return $body['content'][0]['text'] ?? '';
    }

    /** @return array{title: string, start_at: string, end_at: string|null, is_all_day: bool}[] */
    private function parseAiResponse(string $text): array
    {
        $jsonStart = strpos($text, '[');
        $jsonEnd = strrpos($text, ']');

        if ($jsonStart === false || $jsonEnd === false) {
            $jsonStart = strpos($text, '{');
            $jsonEnd = strrpos($text, '}');
            if ($jsonStart !== false && $jsonEnd !== false) {
                $json = substr($text, $jsonStart, $jsonEnd - $jsonStart + 1);
                $decoded = json_decode($json, true);
                if (is_array($decoded) && isset($decoded['events']) && is_array($decoded['events'])) {
                    /** @var array<int, mixed> $events */
                    $events = $decoded['events'];

                    return $this->validateEvents($events);
                }
            }

            return [];
        }

        $json = substr($text, $jsonStart, $jsonEnd - $jsonStart + 1);
        /** @var array<int, mixed>|null $decoded */
        $decoded = json_decode($json, true);

        if (! is_array($decoded)) {
            return [];
        }

        return $this->validateEvents($decoded);
    }

    /**
     * @param  array<int, mixed>  $events
     * @return array{title: string, start_at: string, end_at: string|null, is_all_day: bool}[]
     */
    private function validateEvents(array $events): array
    {
        $result = [];

        foreach ($events as $event) {
            if (! is_array($event)) {
                continue;
            }
            if (empty($event['title']) || ! is_string($event['title'])) {
                continue;
            }
            if (empty($event['start_at']) || ! is_string($event['start_at'])) {
                continue;
            }

            try {
                Carbon::parse($event['start_at']);
            } catch (\Throwable) {
                continue;
            }

            $endAt = null;
            if (! empty($event['end_at']) && is_string($event['end_at'])) {
                try {
                    Carbon::parse($event['end_at']);
                    $endAt = $event['end_at'];
                } catch (\Throwable) {
                    // skip invalid end_at
                }
            }

            $result[] = [
                'title' => $event['title'],
                'start_at' => $event['start_at'],
                'end_at' => $endAt,
                'is_all_day' => (bool) ($event['is_all_day'] ?? false),
            ];
        }

        return $result;
    }
}
