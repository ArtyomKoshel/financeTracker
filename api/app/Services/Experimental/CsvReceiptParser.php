<?php

namespace App\Services\Experimental;

/**
 * Парсинг CSV выписок банков без AI.
 * Поддерживает разделители ; и ,. Ищет колонки по заголовкам (date, amount, description и т.д.).
 */
class CsvReceiptParser
{
    private const MAX_ROWS = 500;

    private const DATE_HEADERS = ['date', 'дата', 'data', 'день', 'дата операции'];

    private const AMOUNT_HEADERS = ['amount', 'sum', 'сумма', 'summa', 'сумма операции'];

    private const AMOUNT_IN_HEADERS = ['amount_in', 'credit', 'зачисление', 'приход', 'сумма зачисления'];

    private const AMOUNT_OUT_HEADERS = ['amount_out', 'debit', 'списание', 'расход', 'сумма списания'];

    private const DESC_HEADERS = ['description', 'merchant', 'описание', 'назначение', 'details', 'операция', 'получатель', 'отправитель', 'контрагент', 'наименование'];

    /**
     * @return array<array{bank_merchant_name: string, amount: float, date: string, type: string, currency: string, raw_description: string}>
     */
    public function parse(string $content, ?string $filename = null): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($content), self::MAX_ROWS + 10);
        if (count($lines) < 2) {
            return [];
        }

        $delimiter = $this->detectDelimiter($lines[0]);
        $headerRow = str_getcsv($lines[0], $delimiter);
        $headerMap = $this->mapHeaders($headerRow);
        if ($headerMap === null) {
            return [];
        }

        $result = [];
        for ($i = 1; $i < count($lines); $i++) {
            $row = str_getcsv($lines[$i], $delimiter);
            if (count($row) < 2) {
                continue;
            }
            $tx = $this->parseRow($row, $headerMap);
            if ($tx) {
                $result[] = $tx;
            }
        }

        return $result;
    }

    private function detectDelimiter(string $firstLine): string
    {
        $semicolon = substr_count($firstLine, ';');
        $comma = substr_count($firstLine, ',');

        return $semicolon >= $comma ? ';' : ',';
    }

    /**
     * @param  array<int, string>  $headers
     * @return array{date: int, amount: int|null, amount_in: int|null, amount_out: int|null, desc: int}|null
     */
    private function mapHeaders(array $headers): ?array
    {
        $dateIdx = null;
        $amountIdx = null;
        $amountInIdx = null;
        $amountOutIdx = null;
        $descIdx = null;
        $headersLower = array_map(fn ($h) => mb_strtolower(trim($h ?? '')), $headers);

        foreach ($headersLower as $idx => $h) {
            if ($dateIdx === null && $this->matchesAny($h, self::DATE_HEADERS)) {
                $dateIdx = $idx;
            }
            if ($amountIdx === null && $this->matchesAny($h, self::AMOUNT_HEADERS)) {
                $amountIdx = $idx;
            }
            if ($amountInIdx === null && $this->matchesAny($h, self::AMOUNT_IN_HEADERS)) {
                $amountInIdx = $idx;
            }
            if ($amountOutIdx === null && $this->matchesAny($h, self::AMOUNT_OUT_HEADERS)) {
                $amountOutIdx = $idx;
            }
            if ($descIdx === null && $this->matchesAny($h, self::DESC_HEADERS)) {
                $descIdx = $idx;
            }
        }

        if ($dateIdx === null || ($amountIdx === null && $amountInIdx === null && $amountOutIdx === null)) {
            return null;
        }
        if ($descIdx === null) {
            $firstUsed = $amountIdx ?? $amountInIdx ?? $amountOutIdx;
            $descIdx = $firstUsed === 0 ? 1 : 0;
        }

        return [
            'date' => $dateIdx,
            'amount' => $amountIdx,
            'amount_in' => $amountInIdx,
            'amount_out' => $amountOutIdx,
            'desc' => $descIdx,
        ];
    }

    private function matchesAny(string $value, array $candidates): bool
    {
        foreach ($candidates as $c) {
            if (mb_strpos($value, $c) !== false || mb_strpos($c, $value) !== false) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<int, string>  $row
     * @param  array{date: int, amount: int|null, amount_in: int|null, amount_out: int|null, desc: int}  $map
     * @return array{bank_merchant_name: string, amount: float, date: string, type: string, currency: string, raw_description: string}|null
     */
    private function parseRow(array $row, array $map): ?array
    {
        $dateStr = trim($row[$map['date']] ?? '');
        $descStr = trim($row[$map['desc']] ?? '');

        if ($dateStr === '') {
            return null;
        }

        $amount = null;
        if ($map['amount'] !== null) {
            $amount = $this->parseAmount(trim($row[$map['amount']] ?? ''));
        }
        if ($amount === null && ($map['amount_in'] !== null || $map['amount_out'] !== null)) {
            $inVal = $map['amount_in'] !== null ? $this->parseAmount(trim($row[$map['amount_in']] ?? '')) : null;
            $outVal = $map['amount_out'] !== null ? $this->parseAmount(trim($row[$map['amount_out']] ?? '')) : null;
            if ($inVal !== null && $inVal > 0) {
                $amount = $inVal;
            } elseif ($outVal !== null && $outVal > 0) {
                $amount = -$outVal;
            }
        }

        if ($amount === null || $amount === 0.0) {
            return null;
        }

        $date = $this->parseDate($dateStr);
        if ($date === null) {
            return null;
        }

        $type = $amount > 0 ? 'income' : 'expense';
        $amount = abs($amount);

        $merchant = $this->extractMerchant($descStr);
        if ($merchant === '') {
            $merchant = mb_substr($descStr, 0, 100) ?: 'Неизвестно';
        }

        return [
            'bank_merchant_name' => $merchant,
            'amount' => $amount,
            'date' => $date,
            'type' => $type,
            'currency' => 'BYN',
            'raw_description' => $descStr,
        ];
    }

    private function parseAmount(string $str): ?float
    {
        $str = preg_replace('/[\s\xc2\xa0]/u', '', $str);
        $str = str_replace([',', ' '], ['.', ''], $str);
        if (preg_match('/^-?[\d.]+$/', $str)) {
            return (float) $str;
        }
        if (preg_match('/^-?[\d\s.,]+/', $str, $m)) {
            $clean = str_replace([' ', ','], ['', '.'], $m[0]);

            return (float) $clean;
        }

        return null;
    }

    private function parseDate(string $str): ?string
    {
        $formats = ['d.m.Y', 'Y-m-d', 'd/m/Y', 'Y.m.d', 'd-m-Y'];
        foreach ($formats as $fmt) {
            $dt = \DateTime::createFromFormat($fmt, $str);
            if ($dt) {
                return $dt->format('Y-m-d');
            }
        }
        if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $str, $m)) {
            return "{$m[1]}-{$m[2]}-{$m[3]}";
        }
        if (preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{4})/', $str, $m)) {
            return sprintf('%04d-%02d-%02d', (int) $m[3], (int) $m[2], (int) $m[1]);
        }

        return null;
    }

    private function extractMerchant(string $desc): string
    {
        $desc = trim($desc);
        if (mb_strlen($desc) > 150) {
            $desc = mb_substr($desc, 0, 150);
        }

        return $desc;
    }
}
