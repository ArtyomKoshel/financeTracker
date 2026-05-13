<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\Auth\AuthService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthServiceTest extends TestCase
{
    use RefreshDatabase;

    private AuthService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new AuthService;
    }

    public function test_hash_password_returns_bcrypt_hash(): void
    {
        $hash = $this->service->hashPassword('secret123');

        $this->assertNotSame('secret123', $hash);
        $this->assertTrue(str_starts_with($hash, '$2y$'));
    }

    public function test_verify_password_with_bcrypt_hash(): void
    {
        $hash = $this->service->hashPassword('mypassword');

        $this->assertTrue($this->service->verifyPassword('mypassword', $hash));
        $this->assertFalse($this->service->verifyPassword('wrong', $hash));
    }

    public function test_verify_password_with_legacy_sha256_hash(): void
    {
        $legacyHash = hash('sha256', 'oldpassword');

        $this->assertTrue($this->service->verifyPassword('oldpassword', $legacyHash));
        $this->assertFalse($this->service->verifyPassword('wrong', $legacyHash));
    }

    public function test_generate_token_returns_jwt_string(): void
    {
        $token = $this->service->generateToken(42, false);

        $this->assertIsString($token);
        $parts = explode('.', $token);
        $this->assertCount(3, $parts);
    }

    public function test_verify_token_returns_payload(): void
    {
        $token = $this->service->generateToken(42, true);

        $payload = $this->service->verifyToken($token);

        $this->assertNotNull($payload);
        $this->assertSame(42, $payload['user_id']);
        $this->assertTrue($payload['is_admin']);
    }

    public function test_verify_token_returns_null_for_invalid_token(): void
    {
        $result = $this->service->verifyToken('invalid.token.here');

        $this->assertNull($result);
    }

    public function test_create_token_uses_user_data(): void
    {
        $user = User::factory()->create(['is_admin' => true]);

        $token = $this->service->createToken($user);
        $payload = $this->service->verifyToken($token);

        $this->assertSame($user->id, $payload['user_id']);
        $this->assertTrue($payload['is_admin']);
    }

    public function test_login_returns_token_for_valid_credentials(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => $this->service->hashPassword('demo123'),
            'is_active' => true,
        ]);
        app()->instance('client_id', $user->id);

        $result = $this->service->login('test@example.com', 'demo123');

        $this->assertNotNull($result);
        $this->assertArrayHasKey('token', $result);
        $this->assertSame($user->id, $result['user']['id']);
    }

    public function test_login_returns_null_for_wrong_password(): void
    {
        $user = User::factory()->create([
            'email' => 'test@example.com',
            'password_hash' => $this->service->hashPassword('demo123'),
            'is_active' => true,
        ]);
        app()->instance('client_id', $user->id);

        $result = $this->service->login('test@example.com', 'wrong');

        $this->assertNull($result);
    }

    public function test_login_returns_null_for_inactive_user(): void
    {
        $user = User::factory()->create([
            'email' => 'inactive@example.com',
            'password_hash' => $this->service->hashPassword('demo123'),
            'is_active' => false,
        ]);
        app()->instance('client_id', $user->id);

        $result = $this->service->login('inactive@example.com', 'demo123');

        $this->assertNull($result);
    }

    public function test_login_returns_null_for_nonexistent_email(): void
    {
        $result = $this->service->login('nobody@example.com', 'demo123');

        $this->assertNull($result);
    }

    public function test_login_rehashes_legacy_sha256_password(): void
    {
        $legacyHash = hash('sha256', 'oldpass');
        $user = User::factory()->create([
            'email' => 'legacy@example.com',
            'password_hash' => $legacyHash,
            'is_active' => true,
        ]);
        app()->instance('client_id', $user->id);

        $result = $this->service->login('legacy@example.com', 'oldpass');

        $this->assertNotNull($result);
        $user->refresh();
        $this->assertTrue(str_starts_with($user->password_hash, '$2y$'));
    }
}
