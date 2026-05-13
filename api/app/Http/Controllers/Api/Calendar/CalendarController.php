<?php

namespace App\Http\Controllers\Api\Calendar;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Calendar\StoreCalendarEventRequest;
use App\Http\Requests\Calendar\UpdateCalendarEventRequest;
use App\Services\Calendar\CalendarParserService;
use App\Services\Calendar\CalendarService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CalendarController extends Controller
{
    public function __construct(
        private readonly CalendarService $calendarService,
        private readonly CalendarParserService $parserService,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $from = Carbon::parse($request->query('from', now()->startOfMonth()->toDateString()));
        $to = Carbon::parse($request->query('to', now()->endOfMonth()->toDateString()));

        $events = $this->calendarService->getByRange($this->clientId(), $from, $to);

        return $this->success(['data' => $events]);
    }

    public function store(StoreCalendarEventRequest $request): JsonResponse
    {
        $event = $this->calendarService->create(
            $this->clientId(),
            $request->validated()
        );

        return $this->success($event, 201);
    }

    public function update(UpdateCalendarEventRequest $request, int $id): JsonResponse
    {
        $event = $this->calendarService->update(
            $this->clientId(),
            $id,
            $request->validated()
        );

        if (! $event) {
            return $this->error('Event not found', 404);
        }

        return $this->success($event);
    }

    public function destroy(int $id): JsonResponse
    {
        if (! $this->calendarService->delete($this->clientId(), $id)) {
            return $this->error('Event not found', 404);
        }

        return $this->success(['deleted' => true]);
    }

    public function parse(Request $request): JsonResponse
    {
        $request->validate([
            'text' => ['required', 'string', 'max:2000'],
        ]);

        $events = $this->parserService->parseFromText(
            (string) $request->input('text'),
            $this->clientId()
        );

        return $this->success(['events' => $events]);
    }
}
