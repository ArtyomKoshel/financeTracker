<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserExperimentalFeature extends Model
{
    protected $fillable = ['user_id', 'feature_code', 'granted_by', 'granted_at'];

    protected $casts = [
        'granted_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function grantedBy()
    {
        return $this->belongsTo(User::class, 'granted_by');
    }

    public static function hasFeature(int $userId, string $featureCode): bool
    {
        return self::where('user_id', $userId)
            ->where('feature_code', $featureCode)
            ->exists();
    }

    public static function getFeaturesForUser(int $userId): array
    {
        return self::where('user_id', $userId)
            ->pluck('feature_code')
            ->values()
            ->all();
    }
}
