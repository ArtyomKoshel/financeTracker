<?php

namespace App\Services\Admin;

use App\Models\Account;
use App\Models\User;
use App\Services\Categories\CategoryService;
use App\Services\Categories\IncomeTypeService;
use Illuminate\Support\Facades\Hash;

class AdminUserService
{
    public function __construct(
        private readonly CategoryService $categoryService,
        private readonly IncomeTypeService $incomeTypeService,
    ) {}

    public function createClient(array $data): User
    {
        $user = User::create([
            'email' => $data['email'],
            'password_hash' => Hash::make($data['password']),
            'name' => $data['name'],
            'is_active' => true,
            'is_admin' => false,
        ]);

        Account::create([
            'name' => 'Основной счёт',
            'balance' => 0,
            'client_id' => $user->id,
        ]);

        $this->incomeTypeService->seedDefaultsForClient($user->id);
        $this->categoryService->seedDefaultsForClient($user->id);

        return $user;
    }
}
