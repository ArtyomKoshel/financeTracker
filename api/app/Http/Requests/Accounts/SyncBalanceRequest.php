<?php

namespace App\Http\Requests\Accounts;

use Illuminate\Foundation\Http\FormRequest;

class SyncBalanceRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'actual_balance' => ['required', 'numeric'],
            'account_id' => ['nullable', 'integer', 'exists:accounts,id'],
        ];
    }
}
