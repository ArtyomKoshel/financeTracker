<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\Settings\SettingsService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SettingsServiceTest extends TestCase
{
    use RefreshDatabase;

    private SettingsService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new SettingsService;
    }

    public function test_get_rate_returns_stored_value(): void
    {
        DB::table('settings')->insert([
            'client_id' => $this->clientId,
            'key' => 'usd_rate',
            'value' => '3.25',
        ]);

        $rate = $this->service->getRate($this->clientId, 'USD');

        $this->assertSame(3.25, $rate);
    }

    public function test_get_rate_returns_default_when_not_set(): void
    {
        $rate = $this->service->getRate($this->clientId, 'USD');

        $this->assertSame(1.0, $rate);
    }

    public function test_get_rate_handles_different_currencies(): void
    {
        DB::table('settings')->insert([
            'client_id' => $this->clientId,
            'key' => 'eur_rate',
            'value' => '3.55',
        ]);

        $rate = $this->service->getRate($this->clientId, 'EUR');

        $this->assertSame(3.55, $rate);
    }

    public function test_get_rate_is_case_insensitive(): void
    {
        DB::table('settings')->insert([
            'client_id' => $this->clientId,
            'key' => 'rub_rate',
            'value' => '0.034',
        ]);

        $rate = $this->service->getRate($this->clientId, 'RUB');

        $this->assertSame(0.034, $rate);
    }
}
