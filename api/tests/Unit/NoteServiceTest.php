<?php

namespace Tests\Unit;

use App\Models\Note;
use App\Models\User;
use App\Services\NoteService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NoteServiceTest extends TestCase
{
    use RefreshDatabase;

    private NoteService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $user = User::factory()->create();
        $this->clientId = $user->id;
        app()->instance('client_id', $this->clientId);
        $this->service = app(NoteService::class);
    }

    public function test_create_note_stores_in_database(): void
    {
        $data = [
            'title' => 'Test Note',
            'content' => 'This is a test note content.',
        ];

        $note = $this->service->create($this->clientId, $data);

        $this->assertInstanceOf(Note::class, $note);
        $this->assertSame('Test Note', $note->title);
        $this->assertSame($this->clientId, $note->client_id);
        $this->assertNotNull($note->summary);
    }

    public function test_create_note_generates_summary(): void
    {
        $data = [
            'title' => 'Summary Test',
            'content' => 'Short content for summary generation.',
        ];

        $note = $this->service->create($this->clientId, $data);

        $this->assertSame('Short content for summary generation.', $note->summary);
    }

    public function test_find_returns_note_for_correct_client(): void
    {
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'My Note',
            'content' => 'Content',
        ]);

        $found = $this->service->find($this->clientId, $note->id);

        $this->assertNotNull($found);
        $this->assertSame('My Note', $found->title);
    }

    public function test_find_returns_null_for_wrong_client(): void
    {
        $other = User::factory()->create();
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other Note',
            'content' => 'Content',
        ]);

        $found = $this->service->find($this->clientId, $note->id);

        $this->assertNull($found);
    }

    public function test_update_note_changes_fields(): void
    {
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'Original',
            'content' => 'Original content',
        ]);

        $updated = $this->service->update($this->clientId, $note->id, [
            'title' => 'Updated Title',
            'content' => 'Updated content',
        ]);

        $this->assertNotNull($updated);
        $this->assertSame('Updated Title', $updated->title);
        $this->assertSame('Updated content', $updated->content);
    }

    public function test_update_returns_null_for_wrong_client(): void
    {
        $other = User::factory()->create();
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other',
            'content' => 'Content',
        ]);

        $result = $this->service->update($this->clientId, $note->id, ['title' => 'Hack']);

        $this->assertNull($result);
    }

    public function test_delete_removes_note(): void
    {
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'To Delete',
            'content' => 'Content',
        ]);

        $result = $this->service->delete($this->clientId, $note->id);

        $this->assertTrue($result);
        $this->assertNull(Note::withoutGlobalScope('client')->find($note->id));
    }

    public function test_delete_returns_false_for_wrong_client(): void
    {
        $other = User::factory()->create();
        $note = Note::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other',
            'content' => 'Content',
        ]);

        $result = $this->service->delete($this->clientId, $note->id);

        $this->assertFalse($result);
    }

    public function test_list_returns_paginated_results(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            Note::withoutGlobalScope('client')->create([
                'client_id' => $this->clientId,
                'title' => "Note $i",
                'content' => "Content $i",
            ]);
        }

        $result = $this->service->list($this->clientId, 2, 1);

        $this->assertCount(2, $result['data']);
        $this->assertSame(5, $result['meta']['total']);
        $this->assertSame(1, $result['meta']['page']);
        $this->assertSame(2, $result['meta']['per_page']);
        $this->assertSame(3, $result['meta']['last_page']);
    }

    public function test_list_page_two(): void
    {
        for ($i = 1; $i <= 5; $i++) {
            Note::withoutGlobalScope('client')->create([
                'client_id' => $this->clientId,
                'title' => "Note $i",
                'content' => "Content $i",
            ]);
        }

        $result = $this->service->list($this->clientId, 2, 2);

        $this->assertCount(2, $result['data']);
        $this->assertSame(2, $result['meta']['page']);
    }

    public function test_list_excludes_other_client_notes(): void
    {
        $other = User::factory()->create();
        Note::withoutGlobalScope('client')->create([
            'client_id' => $other->id,
            'title' => 'Other Note',
            'content' => 'Content',
        ]);
        Note::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'title' => 'My Note',
            'content' => 'Content',
        ]);

        $result = $this->service->list($this->clientId);

        $this->assertSame(1, $result['meta']['total']);
    }
}
