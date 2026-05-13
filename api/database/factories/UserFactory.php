<?php

namespace Database\Factories;

use App\Models\User;
use App\Services\AuthService;
use Illuminate\Database\Eloquent\Factories\Factory;

class UserFactory extends Factory
{
    protected $model = User::class;

    public function definition(): array
    {
        $authService = app(AuthService::class);

        return [
            'name' => $this->faker->name(),
            'email' => $this->faker->unique()->safeEmail(),
            'password_hash' => $authService->hashPassword('password'),
            'is_active' => true,
            'is_admin' => false,
        ];
    }
}
