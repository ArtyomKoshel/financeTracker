<?php

namespace App\Http\Requests\Calendar;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'start_at' => ['sometimes', 'date'],
            'end_at' => ['nullable', 'date', 'after_or_equal:start_at'],
            'is_all_day' => ['nullable', 'boolean'],
            'color' => ['nullable', 'string', 'max:20'],
            'recurrence_rule' => ['nullable', 'string', 'max:255'],
        ];
    }
}
