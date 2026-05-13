<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Category extends Model
{
    protected $fillable = ['name', 'parent_id', 'icon', 'color', 'sort_order', 'is_active', 'client_id'];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    protected static function booted()
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

    public function parent()
    {
        return $this->belongsTo(Category::class, 'parent_id');
    }

    public function subcategories()
    {
        return $this->hasMany(Category::class, 'parent_id');
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class);
    }

    public static function getDefaultCategories(): array
    {
        return [
            ['name' => 'Продукты', 'icon' => '🛒', 'color' => '#4CAF50', 'sort_order' => 1],
            ['name' => 'Транспорт', 'icon' => '🚗', 'color' => '#2196F3', 'sort_order' => 2],
            ['name' => 'Жильё', 'icon' => '🏠', 'color' => '#FF9800', 'sort_order' => 3],
            ['name' => 'Развлечения', 'icon' => '🎬', 'color' => '#9C27B0', 'sort_order' => 4],
            ['name' => 'Здоровье', 'icon' => '💊', 'color' => '#F44336', 'sort_order' => 5],
            ['name' => 'Подарки', 'icon' => '🎁', 'color' => '#E91E63', 'sort_order' => 6],
            ['name' => 'Другое', 'icon' => '📦', 'color' => '#607D8B', 'sort_order' => 99],
        ];
    }

    public static function seedForClient(int $clientId): void
    {
        $exists = self::withoutGlobalScope('client')->where('client_id', $clientId)->exists();
        if ($exists) {
            return;
        }

        foreach (self::getDefaultCategories() as $data) {
            self::withoutGlobalScope('client')->create([
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
