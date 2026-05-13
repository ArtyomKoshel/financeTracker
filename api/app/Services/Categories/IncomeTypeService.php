<?php

namespace App\Services\Categories;

use App\Models\IncomeType;

class IncomeTypeService
{
    public function seedDefaultsForClient(int $clientId): void
    {
        $exists = IncomeType::withoutGlobalScope('client')->where('client_id', $clientId)->exists();
        if ($exists) {
            return;
        }

        foreach (IncomeType::getDefaultTypes() as $i => $data) {
            IncomeType::withoutGlobalScope('client')->create([
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
