<?php

namespace App\Services\Auth;

use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Hash;

class AuthService
{
    protected string $jwtSecret;

    public function __construct()
    {
        $this->jwtSecret = config('app.jwt_secret', 'your-secret-key-change-in-production-please');
    }

    public function hashPassword(string $password): string
    {
        return Hash::make($password);
    }

    public function verifyPassword(string $password, string $hash): bool
    {
        if (Hash::check($password, $hash)) {
            return true;
        }

        // Backward compatibility: check legacy SHA256 hash and rehash to bcrypt
        if (hash_equals($hash, hash('sha256', $password))) {
            return true;
        }

        return false;
    }

    public function login(string $email, string $password): ?array
    {
        $user = User::where('email', $email)->first();
        if (! $user || ! $user->is_active) {
            return null;
        }

        if (! $this->verifyPassword($password, $user->password_hash)) {
            return null;
        }

        // Auto-rehash legacy SHA256 passwords to bcrypt on successful login
        if ($this->isLegacyHash($user->password_hash)) {
            $user->password_hash = $this->hashPassword($password);
        }

        $user->last_login_at = now();
        $user->last_activity_at = now();
        $user->save();

        $token = $this->generateToken($user->id, $user->is_admin);

        return [
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'email' => $user->email,
                'name' => $user->name,
                'is_admin' => $user->is_admin,
            ],
        ];
    }

    protected function isLegacyHash(string $hash): bool
    {
        return strlen($hash) === 64 && ctype_xdigit($hash);
    }

    public function generateToken(int $userId, bool $isAdmin = false): string
    {
        $payload = [
            'user_id' => $userId,
            'is_admin' => $isAdmin,
            'exp' => time() + 24 * 3600,
        ];

        return JWT::encode($payload, $this->jwtSecret, 'HS256');
    }

    public function createToken(User $user): string
    {
        return $this->generateToken($user->id, (bool) $user->is_admin);
    }

    public function verifyToken(string $token): ?array
    {
        try {
            $decoded = JWT::decode($token, new Key($this->jwtSecret, 'HS256'));

            return [
                'user_id' => (int) $decoded->user_id,
                'is_admin' => (bool) ($decoded->is_admin ?? false),
            ];
        } catch (\Exception $e) {
            return null;
        }
    }
}
