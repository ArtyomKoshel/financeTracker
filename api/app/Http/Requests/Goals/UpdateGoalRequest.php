<?php

namespace App\Http\Requests\Goals;

use Illuminate\Foundation\Http\FormRequest;

class UpdateGoalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'target_amount' => 'sometimes|numeric|min:0',
            'currency' => 'sometimes|string|in:BYN,USD,EUR,RUB',
            'target_date' => 'sometimes|date',
            'is_active' => 'sometimes|boolean',
        ];
    }
}
