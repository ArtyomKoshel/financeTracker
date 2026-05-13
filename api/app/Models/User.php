<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;

class User extends Authenticatable
{
    use HasFactory;

    protected $fillable = [
        'email',
        'password_hash',
        'name',
        'is_active',
        'is_admin',
        'telegram_chat_id',
    ];

    protected $hidden = [
        'password_hash',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'is_admin' => 'boolean',
        'last_login_at' => 'datetime',
        'last_activity_at' => 'datetime',
    ];

    public function getAuthPassword()
    {
        return $this->password_hash;
    }

    public function accounts()
    {
        return $this->hasMany(Account::class, 'client_id');
    }

    public function transactions()
    {
        return $this->hasMany(Transaction::class, 'client_id');
    }

    public function categories()
    {
        return $this->hasMany(Category::class, 'client_id');
    }

    public function goals()
    {
        return $this->hasMany(Goal::class, 'client_id');
    }

    public function recurringPayments()
    {
        return $this->hasMany(RecurringPayment::class, 'client_id');
    }
}
