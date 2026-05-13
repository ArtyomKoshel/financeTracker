<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Auth\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_token_for_valid_credentials(): void
    {
        $authService = app(AuthService::class);
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => $authService->hashPassword('password123'),
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'test@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'token',
                    'user',
                ],
            ])
            ->assertJson(['success' => true]);
    }

    public function test_login_fails_for_invalid_credentials(): void
    {
        $response = $this->postJson('/api/auth/login', [
            'email' => 'wrong@example.com',
            'password' => 'wrongpassword',
        ]);

        $response->assertStatus(401);
    }
}
