<?php

namespace App\Services\Notifications;

class TelegramParserService
{
    /**
     * @param  array<string, string>  $incomeKeywords  label/alias → type code, built from user's IncomeTypes
     * @return array{amount: float, type: string, description: string}|null
     */
    public function parse(string $text, array $incomeKeywords = []): ?array
    {
        $text = trim($text);
        if ($text === '') {
            return null;
        }

        $detectedType = $this->detectType($text, $incomeKeywords);
        $cleaned = $detectedType
            ? $this->stripMatchedKeyword($text, $detectedType['keyword'])
            : $text;

        $result = $this->extractAmountAndDescription($cleaned);
        if ($result === null) {
            return null;
        }

        return [
            'amount' => $result['amount'],
            'type' => $detectedType['code'] ?? 'expense',
            'description' => $result['description'],
        ];
    }

    /**
     * @param  array<string, string>  $incomeKeywords
     * @return array{code: string, keyword: string}|null
     */
    private function detectType(string $text, array $incomeKeywords): ?array
    {
        $lower = mb_strtolower($text);
        foreach ($incomeKeywords as $keyword => $code) {
            if (mb_strpos($lower, (string) $keyword) !== false) {
                return ['code' => $code, 'keyword' => (string) $keyword];
            }
        }

        return null;
    }

    private function stripMatchedKeyword(string $text, string $keyword): string
    {
        $pattern = '/'.preg_quote($keyword, '/').'/iu';
        $result = (string) preg_replace($pattern, '', $text, 1);

        return trim((string) preg_replace('/\s+/', ' ', $result));
    }

    /**
     * @return array{amount: float, description: string}|null
     */
    private function extractAmountAndDescription(string $text): ?array
    {
        $text = str_replace(',', '.', $text);

        // "описание 123.45" or "описание 123"
        if (preg_match('/^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:р\.?|br|byn|руб\.?)?$/iu', $text, $m)) {
            $desc = trim($m[1]);
            $amount = (float) $m[2];
            if ($amount > 0) {
                return ['amount' => $amount, 'description' => $desc];
            }
        }

        // "123.45 описание" or "123 описание"
        if (preg_match('/^(\d+(?:\.\d{1,2})?)\s*(?:р\.?|br|byn|руб\.?)?\s+(.+)$/iu', $text, $m)) {
            $amount = (float) $m[1];
            $desc = trim($m[2]);
            if ($amount > 0) {
                return ['amount' => $amount, 'description' => $desc];
            }
        }

        // Just a number: "123.45"
        if (preg_match('/^(\d+(?:\.\d{1,2})?)\s*(?:р\.?|br|byn|руб\.?)?$/iu', $text, $m)) {
            $amount = (float) $m[1];
            if ($amount > 0) {
                return ['amount' => $amount, 'description' => ''];
            }
        }

        return null;
    }
}
