<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CategorizationRuleStat extends Model
{
    protected $fillable = [
        'rule_id',
        'client_id',
        'suggested_category_id',
        'final_category_id',
        'suggested_income_type',
        'final_income_type',
        'accepted',
        'bank_merchant_name',
    ];

    protected $casts = [
        'accepted' => 'boolean',
    ];

    public function rule(): BelongsTo
    {
        return $this->belongsTo(CategorizationRule::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_id');
    }

    public function suggestedCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'suggested_category_id');
    }

    public function finalCategory(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'final_category_id');
    }
}
