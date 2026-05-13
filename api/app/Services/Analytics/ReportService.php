<?php

namespace App\Services\Analytics;

use App\Models\Transaction;
use App\Models\User;

class ReportService
{
    public function getMonthlyHtml(int $clientId, string $month): string
    {
        [$year, $mon] = explode('-', $month);

        $transactions = Transaction::withoutGlobalScope('client')
            ->with(['category', 'account'])
            ->where('client_id', $clientId)
            ->where('month', $month)
            ->orderBy('date')
            ->orderBy('created_at')
            ->get();

        /** @var User|null $user */
        $user = User::find($clientId);
        $userName = $user?->name ?: $user?->email ?: 'Пользователь';

        $totalIncome = $transactions->where('type', '!=', 'expense')
            ->whereNotIn('type', ['savings', 'savings_withdrawal', 'transfer', 'correction'])
            ->sum(fn ($t) => abs((float) $t->amount));

        $totalExpense = $transactions->where('type', 'expense')
            ->sum(fn ($t) => abs((float) $t->amount));

        $totalSavings = $transactions->where('type', 'savings')
            ->sum(fn ($t) => abs((float) $t->amount));

        $byCategory = $transactions->where('type', 'expense')
            ->groupBy('category_id')
            ->map(fn ($group) => [
                'name' => $group->first()?->category?->name ?? 'Без категории',
                'icon' => $group->first()?->category?->icon ?? '📦',
                'total' => $group->sum(fn ($t) => abs((float) $t->amount)),
                'count' => $group->count(),
            ])
            ->sortByDesc('total')
            ->values();

        $monthLabel = $this->monthLabel((int) $mon, (int) $year);

        return $this->buildHtml($monthLabel, $userName, $totalIncome, $totalExpense, $totalSavings, $byCategory, $transactions);
    }

    private function monthLabel(int $month, int $year): string
    {
        $names = ['', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
            'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

        return ($names[$month] ?? '').' '.$year;
    }

    private function fmt(float $amount): string
    {
        return number_format(abs($amount), 2, '.', ' ').' BYN';
    }

    private function buildHtml(
        string $monthLabel,
        string $userName,
        float $income,
        float $expense,
        float $savings,
        \Illuminate\Support\Collection $byCategory,
        \Illuminate\Database\Eloquent\Collection $transactions
    ): string {
        $generatedAt = now()->format('d.m.Y H:i');
        $net = $income - $expense;
        $netSign = $net >= 0 ? '+' : '';
        $netColor = $net >= 0 ? '#16a34a' : '#dc2626';

        $categoryRows = '';
        foreach ($byCategory as $cat) {
            $share = $expense > 0 ? round($cat['total'] / $expense * 100, 1) : 0;
            $barWidth = min(100, (int) ($share * 2));
            $categoryRows .= "<tr>
                <td>{$cat['icon']} ".htmlspecialchars((string) $cat['name'])."</td>
                <td align='right'>".$this->fmt($cat['total'])."</td>
                <td align='right'>{$cat['count']}</td>
                <td>{$share}%<div class='bar' style='width:{$barWidth}px'></div></td>
            </tr>";
        }

        $txRows = '';
        foreach ($transactions as $tx) {
            $typeLabel = match ((string) $tx->type) {
                'expense' => 'Расход',
                'savings' => 'Копилка',
                'transfer' => 'Перевод',
                default => 'Доход',
            };
            $amtColor = $tx->type === 'expense' ? '#dc2626' : '#16a34a';
            $sign = $tx->type === 'expense' ? '−' : '+';
            $desc = htmlspecialchars((string) ($tx->description ?: '—'));
            $cat = htmlspecialchars((string) ($tx->category?->name ?? '—'));
            $date = $tx->date ? $tx->date->format('d.m') : '—';

            $txRows .= "<tr>
                <td>{$date}</td>
                <td>{$typeLabel}</td>
                <td>{$cat}</td>
                <td>{$desc}</td>
                <td align='right' style='color:{$amtColor}'>{$sign}".$this->fmt((float) $tx->amount).'</td>
            </tr>';
        }

        return <<<HTML
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Отчёт — {$monthLabel}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; background: #fff; padding: 24px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .subtitle { color: #555; margin-bottom: 20px; font-size: 12px; }
    .summary { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 18px; min-width: 140px; }
    .card-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
    .card-value { font-size: 18px; font-weight: 700; margin-top: 4px; }
    .green { color: #16a34a; }
    .red { color: #dc2626; }
    .blue { color: #2563eb; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th { background: #f3f4f6; text-align: left; padding: 7px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e5e7eb; }
    td { padding: 6px 10px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .bar { height: 6px; background: #3b82f6; border-radius: 3px; margin-top: 3px; display: inline-block; }
    h2 { font-size: 15px; margin-bottom: 10px; color: #374151; }
    .section { margin-bottom: 28px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
    .print-btn { position: fixed; top: 16px; right: 16px; background: #2563eb; color: #fff;
      border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨 Печать / PDF</button>

  <h1>Финансовый отчёт — {$monthLabel}</h1>
  <p class="subtitle">Для: {$userName} &nbsp;·&nbsp; Сформирован: {$generatedAt}</p>

  <div class="summary">
    <div class="card">
      <div class="card-label">Доходы</div>
      <div class="card-value green">{$this->fmt($income)}</div>
    </div>
    <div class="card">
      <div class="card-label">Расходы</div>
      <div class="card-value red">{$this->fmt($expense)}</div>
    </div>
    <div class="card">
      <div class="card-label">Баланс</div>
      <div class="card-value" style="color:{$netColor}">{$netSign}{$this->fmt($net)}</div>
    </div>
    <div class="card">
      <div class="card-label">В копилку</div>
      <div class="card-value blue">{$this->fmt($savings)}</div>
    </div>
  </div>

  <div class="section">
    <h2>Расходы по категориям</h2>
    <table>
      <thead><tr>
        <th>Категория</th><th>Сумма</th><th>Операций</th><th>Доля</th>
      </tr></thead>
      <tbody>{$categoryRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>Все операции</h2>
    <table>
      <thead><tr>
        <th>Дата</th><th>Тип</th><th>Категория</th><th>Описание</th><th>Сумма</th>
      </tr></thead>
      <tbody>{$txRows}</tbody>
    </table>
  </div>
</body>
</html>
HTML;
    }
}
