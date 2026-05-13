<?php

namespace App\Http\Requests\Budget;

use Illuminate\Foundation\Http\FormRequest;

class StoreCategoryBudgetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'month' => ['required', 'string', 'size:7'],
            'limit_amount' => ['required', 'numeric', 'min:0'],
            'alert_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'is_recurring' => ['nullable', 'boolean'],
            'is_essential' => ['nullable', 'boolean'],
        ];
    }
}
