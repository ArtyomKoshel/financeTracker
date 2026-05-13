<?php

namespace App\Services\Calendar;

use App\Events\DataUpdated;
use App\Models\CalendarEvent;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection;

class CalendarService
{
    /** @return Collection<int, CalendarEvent> */
    public function getByRange(int $clientId, Carbon $from, Carbon $to): Collection
    {
        return CalendarEvent::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->where('start_at', '<=', $to)
            ->where(function ($q) use ($from) {
                $q->where('end_at', '>=', $from)
                    ->orWhereNull('end_at')
                    ->where('start_at', '>=', $from);
            })
            ->orderBy('start_at')
            ->get();
    }

    /** @param array<string, mixed> $data */
    public function create(int $clientId, array $data): CalendarEvent
    {
        $event = CalendarEvent::create([
            'client_id' => $clientId,
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'start_at' => $data['start_at'],
            'end_at' => $data['end_at'] ?? null,
            'is_all_day' => $data['is_all_day'] ?? false,
            'color' => $data['color'] ?? null,
            'recurrence_rule' => $data['recurrence_rule'] ?? null,
            'source' => $data['source'] ?? 'manual',
        ]);

        event(new DataUpdated('calendar'));

        return $event;
    }

    /** @param array<string, mixed> $data */
    public function update(int $clientId, int $id, array $data): ?CalendarEvent
    {
        $event = CalendarEvent::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $event) {
            return null;
        }

        $fields = array_intersect_key($data, array_flip([
            'title', 'description', 'start_at', 'end_at',
            'is_all_day', 'color', 'recurrence_rule',
        ]));

        if (! empty($fields)) {
            $event->update($fields);
        }

        event(new DataUpdated('calendar'));

        return $event->fresh();
    }

    public function delete(int $clientId, int $id): bool
    {
        $event = CalendarEvent::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $event) {
            return false;
        }

        $event->delete();

        event(new DataUpdated('calendar'));

        return true;
    }
}
