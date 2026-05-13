<?php

namespace Tests\Unit;

use App\Models\CalendarEvent;
use App\Models\User;
use App\Services\CalendarService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalendarServiceTest extends TestCase
{
    use RefreshDatabase;

    private CalendarService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = new CalendarService;
    }

    public function test_create_event_stores_in_database(): void
    {
        $data = [
            'title' => 'Meeting',
            'start_at' => '2026-03-01 10:00:00',
            'end_at' => '2026-03-01 11:00:00',
            'is_all_day' => false,
        ];

        $event = $this->service->create($this->clientId, $data);

        $this->assertInstanceOf(CalendarEvent::class, $event);
        $this->assertSame('Meeting', $event->title);
        $this->assertSame($this->clientId, $event->client_id);
        $this->assertFalse($event->is_all_day);
    }

    public function test_create_event_with_all_day_flag(): void
    {
        $data = [
            'title' => 'Holiday',
            'start_at' => '2026-03-08 00:00:00',
            'is_all_day' => true,
        ];

        $event = $this->service->create($this->clientId, $data);

        $this->assertTrue($event->is_all_day);
        $this->assertNull($event->end_at);
    }

    public function test_get_by_range_returns_events_in_range(): void
    {
        CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'In Range',
            'start_at' => '2026-03-15 10:00:00',
            'end_at' => '2026-03-15 11:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);
        CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'Out of Range',
            'start_at' => '2026-05-01 10:00:00',
            'is_all_day' => true,
            'source' => 'manual',
        ]);

        $from = Carbon::parse('2026-03-01');
        $to = Carbon::parse('2026-03-31');
        $events = $this->service->getByRange($this->clientId, $from, $to);

        $this->assertCount(1, $events);
        $this->assertSame('In Range', $events->first()->title);
    }

    public function test_update_event_changes_fields(): void
    {
        $event = CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'Original',
            'start_at' => '2026-03-10 09:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);

        $updated = $this->service->update($this->clientId, $event->id, [
            'title' => 'Updated Title',
            'color' => '#FF0000',
        ]);

        $this->assertNotNull($updated);
        $this->assertSame('Updated Title', $updated->title);
        $this->assertSame('#FF0000', $updated->color);
    }

    public function test_update_returns_null_for_wrong_client(): void
    {
        $other = User::factory()->create();
        $event = CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other',
            'start_at' => '2026-03-10 09:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);

        $result = $this->service->update($this->clientId, $event->id, ['title' => 'Hack']);

        $this->assertNull($result);
    }

    public function test_delete_removes_event(): void
    {
        $event = CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'To Delete',
            'start_at' => '2026-03-10 09:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);

        $result = $this->service->delete($this->clientId, $event->id);

        $this->assertTrue($result);
        $this->assertNull(CalendarEvent::withoutGlobalScope('client')->find($event->id));
    }

    public function test_delete_returns_false_for_wrong_client(): void
    {
        $other = User::factory()->create();
        $event = CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other',
            'start_at' => '2026-03-10 09:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);

        $result = $this->service->delete($this->clientId, $event->id);

        $this->assertFalse($result);
    }

    public function test_update_ignores_non_whitelisted_fields(): void
    {
        $event = CalendarEvent::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'Original',
            'start_at' => '2026-03-10 09:00:00',
            'is_all_day' => false,
            'source' => 'manual',
        ]);

        $updated = $this->service->update($this->clientId, $event->id, [
            'client_id' => 99999,
            'source' => 'hacked',
            'title' => 'Safe Update',
        ]);

        $this->assertSame($this->clientId, $updated->client_id);
        $this->assertSame('manual', $updated->source);
        $this->assertSame('Safe Update', $updated->title);
    }
}
