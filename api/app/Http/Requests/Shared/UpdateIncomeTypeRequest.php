<?php

namespace App\Http\Requests\Shared;

use Illuminate\Foundation\Http\FormRequest;

class UpdateIncomeTypeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'code' => ['sometimes', 'string', 'max:50', 'regex:/^[a-z0-9_]+$/'],
            'label' => ['sometimes', 'string', 'max:255'],
            'icon' => ['nullable', 'string', 'max:10'],
            'default_currency' => ['nullable', 'string', 'max:10'],
            'sort_order' => ['nullable', 'integer'],
            'is_salary_related' => ['nullable', 'boolean'],
        ];
    }
}
