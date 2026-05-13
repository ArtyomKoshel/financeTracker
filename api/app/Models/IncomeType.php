<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class IncomeType extends Model
{
    protected $fillable = [
        'client_id', 'code', 'label', 'icon', 'default_currency',
        'sort_order', 'is_salary_related',
    ];

    protected $casts = [
        'is_salary_related' => 'boolean',
        'sort_order' => 'integer',
    ];

    protected static function booted(): void
    {
        static::addGlobalScope('client', function (Builder $builder) {
            $clientId = app('client_id') ?? auth()->id();
            if ($clientId) {
                $builder->where('client_id', $clientId);
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public static function getDefaultTypes(): array
    {
        return [
            ['code' => 'salary', 'label' => 'Зарплата', 'icon' => '💰', 'sort_order' => 1, 'is_salary_related' => true],
            ['code' => 'advance', 'label' => 'Аванс', 'icon' => '💵', 'sort_order' => 2, 'is_salary_related' => true],
            ['code' => 'bonus', 'label' => 'Премия', 'icon' => '🎁', 'sort_order' => 3, 'is_salary_related' => false],
            ['code' => 'early_pay', 'label' => 'Досрочная', 'icon' => '⚡', 'sort_order' => 4, 'is_salary_related' => false],
            ['code' => 'year_bonus', 'label' => 'Годовой бонус', 'icon' => '🎄', 'sort_order' => 5, 'is_salary_related' => false],
            ['code' => 'vacation', 'label' => 'Отпускные', 'icon' => '🌴', 'sort_order' => 6, 'is_salary_related' => false],
            ['code' => 'casino', 'label' => 'Казино', 'icon' => '🎰', 'sort_order' => 7, 'is_salary_related' => false],
            ['code' => 'other', 'label' => 'Другое', 'icon' => '📦', 'sort_order' => 99, 'is_salary_related' => false],
        ];
    }

    public static function seedForClient(int $clientId): void
    {
        $exists = self::withoutGlobalScope('client')->where('client_id', $clientId)->exists();
        if ($exists) {
            return;
        }

        foreach (self::getDefaultTypes() as $i => $data) {
            self::withoutGlobalScope('client')->create([
                'client_id' => $clientId,
                'code' => $data['code'],
                'label' => $data['label'],
                'icon' => $data['icon'],
                'default_currency' => 'BYN',
                'sort_order' => $data['sort_order'] ?? $i + 1,
                'is_salary_related' => $data['is_salary_related'] ?? false,
            ]);
        }
    }
}
