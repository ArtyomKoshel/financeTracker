<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\PushPreferencesService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PushPreferencesServiceTest extends TestCase
{
    use RefreshDatabase;

    private PushPreferencesService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new PushPreferencesService;
    }

    public function test_get_returns_defaults_when_no_settings(): void
    {
        $result = $this->service->get($this->clientId);

        $this->assertTrue($result['push_overdue']);
        $this->assertTrue($result['push_upcoming']);
        $this->assertSame(1, $result['push_upcoming_days']);
    }

    public function test_get_returns_stored_values(): void
    {
        DB::table('settings')->insert([
            ['client_id' => $this->clientId, 'key' => 'push_overdue', 'value' => '0'],
            ['client_id' => $this->clientId, 'key' => 'push_upcoming', 'value' => '1'],
            ['client_id' => $this->clientId, 'key' => 'push_upcoming_days', 'value' => '3'],
        ]);

        $result = $this->service->get($this->clientId);

        $this->assertFalse($result['push_overdue']);
        $this->assertTrue($result['push_upcoming']);
        $this->assertSame(3, $result['push_upcoming_days']);
    }

    public function test_update_saves_preferences(): void
    {
        $this->service->update($this->clientId, [
            'push_overdue' => false,
            'push_upcoming' => true,
            'push_upcoming_days' => 5,
        ]);

        $result = $this->service->get($this->clientId);

        $this->assertFalse($result['push_overdue']);
        $this->assertTrue($result['push_upcoming']);
        $this->assertSame(5, $result['push_upcoming_days']);
    }

    public function test_update_clamps_upcoming_days(): void
    {
        $this->service->update($this->clientId, [
            'push_upcoming_days' => 99,
        ]);

        $result = $this->service->get($this->clientId);

        $this->assertSame(7, $result['push_upcoming_days']);
    }

    public function test_wants_overdue_returns_true_by_default(): void
    {
        $this->assertTrue($this->service->wantsOverdue($this->clientId));
    }

    public function test_wants_overdue_returns_false_when_disabled(): void
    {
        DB::table('settings')->insert([
            'client_id' => $this->clientId,
            'key' => 'push_overdue',
            'value' => '0',
        ]);

        $this->assertFalse($this->service->wantsOverdue($this->clientId));
    }

    public function test_wants_upcoming_respects_days_threshold(): void
    {
        DB::table('settings')->insert([
            ['client_id' => $this->clientId, 'key' => 'push_upcoming', 'value' => '1'],
            ['client_id' => $this->clientId, 'key' => 'push_upcoming_days', 'value' => '3'],
        ]);

        $this->assertTrue($this->service->wantsUpcoming($this->clientId, 2));
        $this->assertTrue($this->service->wantsUpcoming($this->clientId, 3));
        $this->assertFalse($this->service->wantsUpcoming($this->clientId, 4));
    }

    public function test_wants_upcoming_returns_false_when_disabled(): void
    {
        DB::table('settings')->insert([
            'client_id' => $this->clientId,
            'key' => 'push_upcoming',
            'value' => '0',
        ]);

        $this->assertFalse($this->service->wantsUpcoming($this->clientId, 1));
    }
}
