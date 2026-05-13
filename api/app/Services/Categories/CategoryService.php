<?php

namespace App\Services\Categories;

use App\Models\Category;

class CategoryService
{
    public function seedDefaultsForClient(int $clientId): void
    {
        $exists = Category::withoutGlobalScope('client')->where('client_id', $clientId)->exists();
        if ($exists) {
            return;
        }

        foreach (Category::getDefaultCategories() as $data) {
            Category::withoutGlobalScope('client')->create([
                'client_id' => $clientId,
                'name' => $data['name'],
                'parent_id' => null,
                'icon' => $data['icon'],
                'color' => $data['color'],
                'sort_order' => $data['sort_order'],
                'is_active' => true,
            ]);
        }
    }
}
