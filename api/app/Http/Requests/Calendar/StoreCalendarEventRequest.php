<?php

namespace App\Http\Requests\Calendar;

use Illuminate\Foundation\Http\FormRequest;

class StoreCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'start_at' => ['required', 'date'],
            'end_at' => ['nullable', 'date', 'after_or_equal:start_at'],
            'is_all_day' => ['nullable', 'boolean'],
            'color' => ['nullable', 'string', 'max:20'],
            'recurrence_rule' => ['nullable', 'string', 'max:255'],
            'source' => ['nullable', 'string', 'in:manual,ai_parsed'],
        ];
    }
}
