<?php

namespace App\Services\Notes;

use App\Models\Note;
use App\Services\Ai\AiProviderService;
use App\Services\Ai\AiUsageService;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NoteAnalysisService
{
    public function __construct(
        private readonly AiUsageService $usageService,
    ) {}

    private const MAX_SUMMARY_LENGTH = 100;

    public function generateSummary(string $content): string
    {
        $text = strip_tags($content);
        $text = preg_replace('/\s+/', ' ', $text) ?? $text;
        $text = trim($text);

        if ($text === '') {
            return '';
        }

        if (mb_strlen($text) <= self::MAX_SUMMARY_LENGTH) {
            return $text;
        }

        $sentences = preg_split('/(?<=[.!?])\s+/', $text, -1, PREG_SPLIT_NO_EMPTY);
        if (! is_array($sentences)) {
            return mb_substr($text, 0, self::MAX_SUMMARY_LENGTH).'…';
        }

        $summary = '';
        foreach ($sentences as $sentence) {
            $candidate = $summary === '' ? $sentence : $summary.' '.$sentence;
            if (mb_strlen($candidate) > self::MAX_SUMMARY_LENGTH) {
                break;
            }
            $summary = $candidate;
        }

        if ($summary === '') {
            return mb_substr($text, 0, self::MAX_SUMMARY_LENGTH).'…';
        }

        return $summary;
    }

    /** @return array{summary: string, action_items: string[], suggested_labels: string[]} */
    private function analyzeWithAi(Note $note, string $provider): array
    {
        $config = AiProviderService::getProviderConfig($provider);
        $apiKey = $config['api_key'] ?? null;

        if (! $apiKey) {
            throw new \RuntimeException("AI provider '{$provider}' API key is not configured");
        }

        $content = strip_tags($note->content);
        $prompt = "Summarize this note in 2-3 sentences. Extract action items. Suggest labels.\n\nNote title: {$note->title}\nNote content: {$content}\n\nRespond in JSON format: {\"summary\": \"...\", \"action_items\": [\"...\"], \"suggested_labels\": [\"...\"]}";

        if ($provider === 'anthropic') {
            return $this->callAnthropic($config, $prompt);
        }

        return $this->callOpenAiCompatible($config, $prompt);
    }

    /**
     * @param  array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool}  $config
     * @return array{summary: string, action_items: string[], suggested_labels: string[]}
     */
    private function callOpenAiCompatible(array $config, string $prompt): array
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
            'temperature' => 0.3,
            'max_tokens' => 512,
            'response_format' => ['type' => 'json_object'],
        ]);

        if (! $response->successful()) {
            throw new \RuntimeException('AI API request failed: '.$response->status());
        }

        $userId = auth()->id();
        if ($userId) {
            $this->usageService->storeFromResponse($userId, $response);
        }

        /** @var array{choices: array<int, array{message: array{content: string}}>} $body */
        $body = $response->json();
        $text = $body['choices'][0]['message']['content'] ?? '';

        return $this->parseAiResponse($text);
    }

    /**
     * @param  array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool}  $config
     * @return array{summary: string, action_items: string[], suggested_labels: string[]}
     */
    private function callAnthropic(array $config, string $prompt): array
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
        $text = $body['content'][0]['text'] ?? '';

        return $this->parseAiResponse($text);
    }

    /** @return array{summary: string, action_items: string[], suggested_labels: string[]} */
    private function parseAiResponse(string $text): array
    {
        $jsonStart = strpos($text, '{');
        $jsonEnd = strrpos($text, '}');

        if ($jsonStart !== false && $jsonEnd !== false) {
            $json = substr($text, $jsonStart, $jsonEnd - $jsonStart + 1);
            /** @var array{summary?: string, action_items?: string[], suggested_labels?: string[]}|null $decoded */
            $decoded = json_decode($json, true);

            if (is_array($decoded)) {
                return [
                    'summary' => is_string($decoded['summary'] ?? null) ? $decoded['summary'] : '',
                    'action_items' => is_array($decoded['action_items'] ?? null) ? array_values(array_filter($decoded['action_items'], 'is_string')) : [],
                    'suggested_labels' => is_array($decoded['suggested_labels'] ?? null) ? array_values(array_filter($decoded['suggested_labels'], 'is_string')) : [],
                ];
            }
        }

        throw new \RuntimeException('Failed to parse AI response as JSON');
    }

    /**
     * @param  array<int, array{id: int, title: string, summary: string}>  $existingNotes
     * @return array{matched_note_id: int|null, suggested_label: string|null, reason: string}
     */
    public function suggestPlacement(string $content, array $existingNotes, int $userId): array
    {
        if (count($existingNotes) === 0) {
            return ['matched_note_id' => null, 'suggested_label' => null, 'reason' => ''];
        }

        $provider = AiProviderService::getProviderForUser($userId);

        try {
            return $this->suggestWithAi($content, $existingNotes, $provider);
        } catch (\Throwable $e) {
            Log::channel('ai')->warning('NoteAnalysisService: AI suggest failed', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);

            return ['matched_note_id' => null, 'suggested_label' => null, 'reason' => ''];
        }
    }

    /**
     * @param  array<int, array{id: int, title: string, summary: string}>  $existingNotes
     * @return array{matched_note_id: int|null, suggested_label: string|null, reason: string}
     */
    private function suggestWithAi(string $content, array $existingNotes, string $provider): array
    {
        $config = AiProviderService::getProviderConfig($provider);
        $apiKey = $config['api_key'] ?? null;

        if (! $apiKey) {
            throw new \RuntimeException("AI provider '{$provider}' API key is not configured");
        }

        $notesList = '';
        foreach ($existingNotes as $n) {
            $notesList .= "- ID:{$n['id']} \"{$n['title']}\" — {$n['summary']}\n";
        }

        $prompt = <<<PROMPT
User is adding a note with this content:
"{$content}"

Here are their existing notes:
{$notesList}
Which existing note is the most relevant match for this new content? Also suggest a short label/tag for this content.

Respond in JSON: {"matched_note_id": <id or null>, "suggested_label": "<label or null>", "reason": "<short explanation in Russian>"}
If no note is relevant, set matched_note_id to null.
PROMPT;

        $text = $this->callAiRaw($config, $prompt, $provider, ['as_json' => true]);

        return $this->parseSuggestResponse($text, $existingNotes);
    }

    /**
     * @param  array{base_url: string, api_key: string|null, model: string, verify_ssl?: bool}  $config
     * @param  array{as_json?: bool, max_tokens?: int}  $options
     */
    private function callAiRaw(array $config, string $prompt, string $provider, array $options = []): string
    {
        $maxTokens = $options['max_tokens'] ?? 256;
        $asJson = $options['as_json'] ?? false;

        if ($provider === 'anthropic') {
            $response = Http::withHeaders([
                'x-api-key' => (string) $config['api_key'],
                'anthropic-version' => '2023-06-01',
                'Content-Type' => 'application/json',
            ])->post("{$config['base_url']}/messages", [
                'model' => $config['model'],
                'max_tokens' => $maxTokens,
                'messages' => [['role' => 'user', 'content' => $prompt]],
            ]);

            if (! $response->successful()) {
                throw new \RuntimeException('Anthropic API request failed: '.$response->status());
            }

            /** @var array{content: array<int, array{text: string}>} $body */
            $body = $response->json();

            return $body['content'][0]['text'] ?? '';
        }

        $http = Http::withToken((string) $config['api_key'])
            ->withHeaders(['Content-Type' => 'application/json']);

        if (isset($config['verify_ssl']) && $config['verify_ssl'] === false) {
            $http = $http->withoutVerifying();
        }

        $payload = [
            'model' => $config['model'],
            'messages' => [['role' => 'user', 'content' => $prompt]],
            'temperature' => 0.3,
            'max_tokens' => $maxTokens,
        ];
        if ($asJson) {
            $payload['response_format'] = ['type' => 'json_object'];
        }

        $response = $http->post("{$config['base_url']}/chat/completions", $payload);

        if (! $response->successful()) {
            throw new \RuntimeException('AI API request failed: '.$response->status());
        }

        $authUserId = auth()->id();
        if ($authUserId) {
            $this->usageService->storeFromResponse($authUserId, $response);
        }

        /** @var array{choices: array<int, array{message: array{content: string}}>} $body */
        $body = $response->json();

        return $body['choices'][0]['message']['content'] ?? '';
    }

    /**
     * @param  array<int, array{id: int, title: string, summary: string}>  $existingNotes
     * @return array{matched_note_id: int|null, suggested_label: string|null, reason: string}
     */
    private function parseSuggestResponse(string $text, array $existingNotes): array
    {
        $jsonStart = strpos($text, '{');
        $jsonEnd = strrpos($text, '}');

        if ($jsonStart !== false && $jsonEnd !== false) {
            $json = substr($text, $jsonStart, $jsonEnd - $jsonStart + 1);
            /** @var array{matched_note_id?: int|null, suggested_label?: string|null, reason?: string}|null $decoded */
            $decoded = json_decode($json, true);

            if (is_array($decoded)) {
                $matchedId = isset($decoded['matched_note_id']) && is_int($decoded['matched_note_id'])
                    ? $decoded['matched_note_id']
                    : null;

                $validIds = array_column($existingNotes, 'id');
                if ($matchedId !== null && ! in_array($matchedId, $validIds, true)) {
                    $matchedId = null;
                }

                return [
                    'matched_note_id' => $matchedId,
                    'suggested_label' => is_string($decoded['suggested_label'] ?? null) ? $decoded['suggested_label'] : null,
                    'reason' => is_string($decoded['reason'] ?? null) ? $decoded['reason'] : '',
                ];
            }
        }

        return ['matched_note_id' => null, 'suggested_label' => null, 'reason' => ''];
    }

    /** @return string formatted markdown content */
    public function formatContent(string $content, int $userId): string
    {
        $content = trim($content);
        if ($content === '') {
            return '';
        }

        $provider = AiProviderService::getProviderForUser($userId);

        try {
            return $this->formatWithAi($content, $provider);
        } catch (\Throwable $e) {
            Log::channel('ai')->warning('NoteAnalysisService: AI format failed', [
                'provider' => $provider,
                'error' => $e->getMessage(),
            ]);

            return $content;
        }
    }

    private function formatWithAi(string $content, string $provider): string
    {
        $config = AiProviderService::getProviderConfig($provider);
        $apiKey = $config['api_key'] ?? null;

        if (! $apiKey) {
            throw new \RuntimeException("AI provider '{$provider}' API key is not configured");
        }

        $prompt = <<<PROMPT
Отформатируй текст заметки в Markdown. Определи структуру:
- Заголовки — используй # ## ### в зависимости от уровня
- Код — оберни в ``` с указанием языка если возможно
- Списки — используй - или 1. 2. 3.
- Жирный/курсив — **bold** *italic*
- Ссылки — [текст](url)

Верни ТОЛЬКО отформатированный текст, без пояснений. Сохрани весь исходный контент, не удаляй и не добавляй информацию.

Исходный текст:
---
{$content}
---
PROMPT;

        $text = $this->callAiRaw($config, $prompt, $provider, ['max_tokens' => 4096]);

        return trim($text) ?: $content;
    }

    /** @return array{summary: string, action_items: string[], suggested_labels: string[]} */
    private function fallbackAnalysis(Note $note): array
    {
        $summary = $this->generateSummary($note->content);

        return [
            'summary' => $summary,
            'action_items' => [],
            'suggested_labels' => [],
        ];
    }
}
