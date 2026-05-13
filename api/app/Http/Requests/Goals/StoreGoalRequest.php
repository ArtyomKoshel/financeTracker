<?php

namespace App\Http\Requests\Goals;

use Illuminate\Foundation\Http\FormRequest;

class StoreGoalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'target_amount' => 'required|numeric|min:0',
            'currency' => 'sometimes|string|in:BYN,USD,EUR,RUB',
            'target_date' => 'required|date',
        ];
    }
}
