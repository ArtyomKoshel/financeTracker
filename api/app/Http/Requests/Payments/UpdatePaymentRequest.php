<?php

namespace App\Http\Requests\Payments;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'day_of_month' => 'nullable|integer|min:0|max:31',
            'due_date' => 'nullable|date',
            'currency' => 'nullable|string',
            'category' => 'nullable|string|in:essential,optional',
            'category_id' => 'nullable|integer',
            'is_variable' => 'nullable|boolean',
            'is_one_time' => 'nullable|boolean',
            'is_subscription' => 'nullable|boolean',
            'cancel_by_date' => 'nullable|date',
            'is_income' => 'nullable|boolean',
            'description' => 'nullable|string|max:500',
        ];
    }
}
